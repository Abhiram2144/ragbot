import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.config import settings

_COLLECTION = "chunks"
_VECTOR_SIZE = 1536

_client = QdrantClient(url=settings.QDRANT_URL)


def ensure_collection() -> None:
    existing = {c.name for c in _client.get_collections().collections}
    if _COLLECTION in existing:
        return

    _client.create_collection(
        collection_name=_COLLECTION,
        vectors_config=VectorParams(size=_VECTOR_SIZE, distance=Distance.COSINE),
    )


def index_chunks(
    org_id: str,
    kb_id: str,
    document_id: str,
    chunks: list[str],
    vectors: list[list[float]],
) -> None:
    if not chunks:
        return

    points = [
        PointStruct(
            id=str(_chunk_point_id(document_id, chunk_index)),
            vector=vector,
            payload={
                "org_id": org_id,
                "kb_id": kb_id,
                "document_id": document_id,
                "chunk_index": chunk_index,
                "chunk_text": chunk_text,
            },
        )
        for chunk_index, (chunk_text, vector) in enumerate(zip(chunks, vectors))
    ]

    _client.upsert(collection_name=_COLLECTION, points=points)


def search_chunks(
    org_id: str,
    kb_id: str,
    query_vector: list[float],
    top_k: int,
) -> list[dict]:
    hits = _client.search(
        collection_name=_COLLECTION,
        query_vector=query_vector,
        query_filter=Filter(
            must=[
                FieldCondition(key="org_id", match=MatchValue(value=org_id)),
                FieldCondition(key="kb_id", match=MatchValue(value=kb_id)),
            ]
        ),
        limit=top_k,
        with_payload=True,
    )
    return [
        {
            "chunk_text": hit.payload["chunk_text"],
            "score": hit.score,
            "document_id": hit.payload["document_id"],
            "chunk_index": hit.payload["chunk_index"],
        }
        for hit in hits
    ]


def _chunk_point_id(document_id: str, chunk_index: int) -> uuid.UUID:
    # Deterministic UUID so re-indexing the same document overwrites, not duplicates.
    namespace = uuid.UUID(document_id)
    return uuid.uuid5(namespace, str(chunk_index))
