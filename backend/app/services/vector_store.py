import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    IsNullCondition,
    MatchValue,
    PayloadField,
    PointStruct,
    SparseVector,
    SparseVectorParams,
    VectorParams,
)

from app.config import settings

_COLLECTION = "chunks"
_VECTOR_SIZE = 1536
_RRF_K = 60

_client = QdrantClient(url=settings.QDRANT_URL)


def _query_points(query, using: str, query_filter: Filter, limit: int):
    """Run a named-vector search across qdrant-client API generations."""
    return _client.query_points(
        collection_name=_COLLECTION,
        query=query,
        using=using,
        query_filter=query_filter,
        limit=limit,
        with_payload=True,
    ).points


def _document_filter(org_id: str, kb_id: str, document_id: str | None = None) -> Filter:
    conditions = [
        FieldCondition(key="org_id", match=MatchValue(value=org_id)),
        FieldCondition(key="kb_id", match=MatchValue(value=kb_id)),
    ]
    if document_id is not None:
        conditions.append(FieldCondition(key="document_id", match=MatchValue(value=document_id)))
    return Filter(must=conditions)


def _published_filter(org_id: str, kb_id: str) -> Filter:
    return Filter(
        must=[*_document_filter(org_id, kb_id).must],
        should=[
            FieldCondition(key="publication_status", match=MatchValue(value="published")),
            IsNullCondition(is_null=PayloadField(key="publication_status")),
        ],
    )


def ensure_collection() -> None:
    """Create the chunks collection if it doesn't exist.

    Uses named vectors (dense + sparse) required by the Phase 4 schema.
    Existing deployments on the old unnamed-vector schema must run
    scripts/migrate_collection.py before this takes effect.
    """
    existing = {c.name for c in _client.get_collections().collections}
    if _COLLECTION in existing:
        return

    _client.create_collection(
        collection_name=_COLLECTION,
        vectors_config={"dense": VectorParams(size=_VECTOR_SIZE, distance=Distance.COSINE)},
        sparse_vectors_config={"sparse": SparseVectorParams()},
    )


def index_chunks(
    org_id: str,
    kb_id: str,
    document_id: str,
    publication_status: str,
    chunks: list[str],
    dense_vectors: list[list[float]],
    sparse_vectors: list[dict],
) -> None:
    if not chunks:
        return

    points = [
        PointStruct(
            id=str(_chunk_point_id(document_id, chunk_index)),
            vector={
                "dense": dense_vec,
                "sparse": SparseVector(
                    indices=sparse_vec["indices"],
                    values=sparse_vec["values"],
                ),
            },
            payload={
                "org_id": org_id,
                "kb_id": kb_id,
                "document_id": document_id,
                "publication_status": publication_status,
                "chunk_index": chunk_index,
                "chunk_text": chunk_text,
            },
        )
        for chunk_index, (chunk_text, dense_vec, sparse_vec) in enumerate(
            zip(chunks, dense_vectors, sparse_vectors)
        )
    ]

    _client.upsert(collection_name=_COLLECTION, points=points)


def search_chunks(
    org_id: str,
    kb_id: str,
    query_vector: list[float],
    top_k: int,
) -> list[dict]:
    """Dense-only search on the named 'dense' vector slot.

    Requires the Phase 4 collection schema (named vectors).
    Run scripts/migrate_collection.py if upgrading from the old schema.
    """
    hits = _query_points(
        query_vector,
        "dense",
        _published_filter(org_id, kb_id),
        top_k,
    )
    return [
        {
            "chunk_id": str(hit.id),
            "chunk_text": hit.payload["chunk_text"],
            "score": hit.score,
            "document_id": hit.payload["document_id"],
            "chunk_index": hit.payload["chunk_index"],
        }
        for hit in hits
    ]


def search_chunks_dense(
    org_id: str,
    kb_id: str,
    dense_vector: list[float],
    top_n: int,
) -> list[dict]:
    """Return top-N results using dense cosine similarity only."""
    hits = _query_points(
        dense_vector,
        "dense",
        _published_filter(org_id, kb_id),
        top_n,
    )
    return [
        {
            "chunk_id": str(hit.id),
            "chunk_text": hit.payload["chunk_text"],
            "score": hit.score,
            "document_id": hit.payload["document_id"],
            "chunk_index": hit.payload["chunk_index"],
        }
        for hit in hits
    ]


def search_chunks_sparse(
    org_id: str,
    kb_id: str,
    sparse_vector: dict,
    top_n: int,
) -> list[dict]:
    """Return top-N results using BM25 sparse similarity only."""
    hits = _query_points(
        SparseVector(
            indices=sparse_vector["indices"],
            values=sparse_vector["values"],
        ),
        "sparse",
        _published_filter(org_id, kb_id),
        top_n,
    )
    return [
        {
            "chunk_id": str(hit.id),
            "chunk_text": hit.payload["chunk_text"],
            "score": hit.score,
            "document_id": hit.payload["document_id"],
            "chunk_index": hit.payload["chunk_index"],
        }
        for hit in hits
    ]


def update_document_publication_status(
    org_id: str,
    kb_id: str,
    document_id: str,
    publication_status: str,
) -> None:
    """Keep indexed chunks aligned with the document's publication state."""
    existing = {collection.name for collection in _client.get_collections().collections}
    if _COLLECTION not in existing:
        return
    _client.set_payload(
        collection_name=_COLLECTION,
        payload={"publication_status": publication_status},
        points=_document_filter(org_id, kb_id, document_id),
    )


def hybrid_search_chunks(
    org_id: str,
    kb_id: str,
    dense_vector: list[float],
    sparse_vector: dict,
    top_k: int,
) -> list[dict]:
    """Merge dense + sparse results using Reciprocal Rank Fusion.

    Each path fetches settings.DENSE_SPARSE_FANOUT candidates.
    RRF score = Σ 1 / (_RRF_K + rank), where rank is 1-based.
    Tie-breaking: higher dense cosine score wins.
    Edge cases: if one path returns nothing, the other path's order is used
    directly (RRF scores will reflect only one signal). If both are empty,
    returns [].
    """
    fanout = settings.DENSE_SPARSE_FANOUT

    dense_results = search_chunks_dense(org_id, kb_id, dense_vector, fanout) if dense_vector else []
    sparse_results = search_chunks_sparse(org_id, kb_id, sparse_vector, fanout) if sparse_vector else []

    if not dense_results and not sparse_results:
        return []

    # chunk key = (document_id, chunk_index) — uniquely identifies a point
    rrf_scores: dict[tuple, float] = {}
    dense_scores: dict[tuple, float] = {}
    sparse_scores: dict[tuple, float] = {}
    payloads: dict[tuple, dict] = {}

    for rank, hit in enumerate(dense_results, start=1):
        key = (hit["document_id"], hit["chunk_index"])
        rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (_RRF_K + rank)
        dense_scores[key] = hit["score"]
        payloads[key] = hit

    for rank, hit in enumerate(sparse_results, start=1):
        key = (hit["document_id"], hit["chunk_index"])
        rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (_RRF_K + rank)
        sparse_scores[key] = hit["score"]
        if key not in payloads:
            payloads[key] = hit

    merged = sorted(
        rrf_scores.keys(),
        key=lambda k: (rrf_scores[k], dense_scores.get(k, 0.0)),
        reverse=True,
    )

    results = []
    for key in merged[:top_k]:
        hit = payloads[key]
        results.append(
            {
                "chunk_id": hit["chunk_id"],
                "chunk_text": hit["chunk_text"],
                "score": rrf_scores[key],
                "document_id": hit["document_id"],
                "chunk_index": hit["chunk_index"],
                # Per-signal scores for observability (query_logs.chunk_scores).
                # None means that path didn't return this chunk at all, not
                # that its contribution was zero — kept distinct from the
                # 0.0 tie-break filler used in the sort key above.
                "dense_score": dense_scores.get(key),
                "sparse_score": sparse_scores.get(key),
                "rrf_score": rrf_scores[key],
            }
        )
    return results


def scroll_chunks_for_kb(kb_id: str) -> list[dict]:
    """Return every indexed chunk for a KB, for eval-set tooling (dump_chunks.py).

    Not org_id-scoped — kb_id already uniquely determines the org via the FK
    relationship, so this is safe for a local/dev management script.
    """
    results: list[dict] = []
    offset = None

    while True:
        points, offset = _client.scroll(
            collection_name=_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="kb_id", match=MatchValue(value=kb_id))]
            ),
            limit=100,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        results.extend(
            {
                "chunk_id": point.id,
                "document_id": point.payload["document_id"],
                "chunk_index": point.payload["chunk_index"],
                "chunk_text": point.payload["chunk_text"],
            }
            for point in points
        )
        if offset is None:
            break

    return results


def _chunk_point_id(document_id: str, chunk_index: int) -> uuid.UUID:
    # Deterministic UUID so re-indexing the same document overwrites, not duplicates.
    namespace = uuid.UUID(document_id)
    return uuid.uuid5(namespace, str(chunk_index))
