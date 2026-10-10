import time
from typing import TYPE_CHECKING

from openai import OpenAI, RateLimitError, APIStatusError

from app.config import settings

if TYPE_CHECKING:
    from fastembed import SparseTextEmbedding

_MODEL = "text-embedding-3-small"
_SPARSE_MODEL_NAME = "Qdrant/bm25"
_BATCH_SIZE = 100
_MAX_ATTEMPTS = 3

_client = OpenAI(api_key=settings.OPENAI_API_KEY)

# Lazy-initialised — FastEmbed downloads the BM25 tokenizer (~2 MB) on first use.
_sparse_model: "SparseTextEmbedding | None" = None


def _get_sparse_model() -> "SparseTextEmbedding":
    global _sparse_model
    if _sparse_model is None:
        from fastembed import SparseTextEmbedding  # noqa: PLC0415
        _sparse_model = SparseTextEmbedding(model_name=_SPARSE_MODEL_NAME)
    return _sparse_model


def embed_query(text: str) -> list[float]:
    return embed_chunks([text])[0]


def sparse_embed_query(text: str) -> dict:
    """Return a BM25 sparse vector as {"indices": [...], "values": [...]}.

    Compatible with Qdrant's SparseVector(indices=..., values=...) constructor.
    Indices are vocabulary token IDs; values are BM25 weights.
    """
    model = _get_sparse_model()
    result = next(model.embed([text]))
    return {"indices": result.indices.tolist(), "values": result.values.tolist()}


def sparse_embed_chunks(chunks: list[str]) -> list[dict]:
    """Return BM25 sparse vectors for a list of chunks.

    FastEmbed processes the list in one pass internally; no batching loop needed.
    Returns one {"indices": [...], "values": [...]} dict per chunk, in order.
    """
    if not chunks:
        return []
    model = _get_sparse_model()
    return [
        {"indices": r.indices.tolist(), "values": r.values.tolist()}
        for r in model.embed(chunks)
    ]


def embed_chunks(chunks: list[str]) -> list[list[float]]:
    if not chunks:
        return []

    results: list[list[float]] = [[] for _ in chunks]

    for batch_start in range(0, len(chunks), _BATCH_SIZE):
        batch = chunks[batch_start : batch_start + _BATCH_SIZE]
        vectors = _embed_with_retry(batch)
        for i, vec in enumerate(vectors):
            results[batch_start + i] = vec

    return results


def _embed_with_retry(batch: list[str]) -> list[list[float]]:
    delay = 1.0
    last_exc: Exception | None = None

    for attempt in range(_MAX_ATTEMPTS):
        try:
            response = _client.embeddings.create(model=_MODEL, input=batch)
            # API guarantees items are returned in the same order as input.
            return [item.embedding for item in response.data]
        except RateLimitError as exc:
            last_exc = exc
        except APIStatusError as exc:
            # Retry on 5xx transient errors; re-raise immediately on 4xx.
            if exc.status_code < 500:
                raise
            last_exc = exc

        if attempt < _MAX_ATTEMPTS - 1:
            time.sleep(delay)
            delay *= 2

    raise RuntimeError(f"Embedding failed after {_MAX_ATTEMPTS} attempts") from last_exc
