import logging
import time

import cohere

from app.config import settings

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = 3
_RERANK_MODEL = "rerank-v3.5"

_client = cohere.ClientV2(api_key=settings.COHERE_API_KEY)


def rerank_chunks(
    question: str,
    chunks: list[dict],
    top_n: int,
) -> tuple[list[dict], bool]:
    """Rerank chunks using Cohere's cross-encoder.

    Returns (reranked_chunks, rerank_used). rerank_used=False means Cohere
    was unavailable and chunks[:top_n] in RRF order were returned instead.
    Never raises — caller can log rerank_used for observability (Phase 4.5+).
    """
    if not chunks:
        return [], False

    try:
        reranked = _rerank_with_retry(question, chunks, top_n)
        return reranked, True
    except Exception as exc:
        logger.warning("Cohere rerank failed, falling back to RRF order: %s", exc)
        return chunks[:top_n], False


def _rerank_with_retry(
    question: str,
    chunks: list[dict],
    top_n: int,
) -> list[dict]:
    documents = [c["chunk_text"] for c in chunks]
    delay = 1.0
    last_exc: Exception | None = None

    for attempt in range(_MAX_ATTEMPTS):
        try:
            response = _client.rerank(
                model=_RERANK_MODEL,
                query=question,
                documents=documents,
                top_n=top_n,
            )
            return [
                {
                    **chunks[result.index],
                    "score": result.relevance_score,
                    "rerank_score": result.relevance_score,
                }
                for result in response.results
            ]
        except cohere.TooManyRequestsError as exc:
            last_exc = exc
        except Exception as exc:
            # Re-raise 4xx immediately (bad request, auth, etc.) so the
            # outer fallback handler in rerank_chunks() catches it without
            # burning retry attempts on a non-retryable error.
            status = getattr(exc, "status_code", None)
            if status is not None and 400 <= status < 500:
                raise
            last_exc = exc

        if attempt < _MAX_ATTEMPTS - 1:
            time.sleep(delay)
            delay *= 2

    raise RuntimeError(f"Cohere rerank failed after {_MAX_ATTEMPTS} attempts") from last_exc
