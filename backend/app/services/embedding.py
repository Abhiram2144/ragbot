import time

from openai import OpenAI, RateLimitError, APIStatusError

from app.config import settings

_MODEL = "text-embedding-3-small"
_BATCH_SIZE = 100
_MAX_ATTEMPTS = 3

_client = OpenAI(api_key=settings.OPENAI_API_KEY)


def embed_query(text: str) -> list[float]:
    return embed_chunks([text])[0]


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
