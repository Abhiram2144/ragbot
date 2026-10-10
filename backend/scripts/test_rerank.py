"""
Smoke-test for rerank_chunks().

Part 1 — normal path: ranks 5 fake chunks (mix of clearly relevant and
irrelevant) for an auth-related question and confirms the auth chunks
rise to the top.

Part 2 — failure simulation: replaces the Cohere client with one using an
invalid API key, calls rerank_chunks(), and confirms the fallback returns
results without raising and sets rerank_used=False.

Run from the backend/ directory:

    python scripts/test_rerank.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cohere

import app.services.reranking as reranking_module
from app.services.reranking import rerank_chunks

QUESTION = "How do I handle authentication errors in the API?"

# Mix of relevant (doc-2, doc-4) and irrelevant (doc-1, doc-3, doc-5) chunks.
FAKE_CHUNKS = [
    {
        "chunk_text": (
            "To reset your password, visit the account settings page "
            "and click 'Forgot Password'."
        ),
        "document_id": "doc-1",
        "chunk_index": 0,
        "score": 0.0164,
    },
    {
        "chunk_text": (
            "Authentication errors (401 Unauthorized) occur when the JWT token is "
            "missing, expired, or has an invalid signature. Ensure the Authorization "
            "header is set to 'Bearer <token>'."
        ),
        "document_id": "doc-2",
        "chunk_index": 0,
        "score": 0.0161,
    },
    {
        "chunk_text": (
            "The rate limiting policy allows 100 requests per minute per API key. "
            "Exceeded requests return HTTP 429 Too Many Requests."
        ),
        "document_id": "doc-3",
        "chunk_index": 0,
        "score": 0.0159,
    },
    {
        "chunk_text": (
            "API authentication uses JSON Web Tokens (JWT). A 401 response means the "
            "token is invalid or expired. A 403 means the token is valid but the user "
            "lacks the required permission scope."
        ),
        "document_id": "doc-4",
        "chunk_index": 0,
        "score": 0.0157,
    },
    {
        "chunk_text": (
            "Database connection pooling is configured via the DATABASE_POOL_SIZE "
            "environment variable. The default pool size is 10 connections."
        ),
        "document_id": "doc-5",
        "chunk_index": 0,
        "score": 0.0155,
    },
]

_SEP = "=" * 72
_AUTH_DOC_IDS = {"doc-2", "doc-4"}


def _print_results(results: list[dict]) -> None:
    for i, chunk in enumerate(results, start=1):
        score = chunk.get("score", 0.0)
        preview = chunk["chunk_text"][:75].replace("\n", " ")
        flag = " <-- auth-relevant" if chunk["document_id"] in _AUTH_DOC_IDS else ""
        print(f"  {i}. [{chunk['document_id']}] score={score:.4f}  {preview!r}{flag}")


def test_normal_path() -> None:
    print("Part 1 — normal Cohere rerank")
    print(_SEP)
    results, rerank_used = rerank_chunks(QUESTION, FAKE_CHUNKS, top_n=3)
    print(f"rerank_used = {rerank_used}  (expected: True)")
    _print_results(results)

    top_ids = {r["document_id"] for r in results}
    overlap = _AUTH_DOC_IDS & top_ids
    if overlap:
        print(f"\nAuth-relevant chunks in top-3: {overlap} — OK")
    else:
        print("\nWARNING: no auth-relevant chunks in top-3 — check reranking quality")
    print()


def test_failure_fallback() -> None:
    print("Part 2 — Cohere failure simulation (invalid API key)")
    print(_SEP)

    original_client = reranking_module._client
    try:
        reranking_module._client = cohere.ClientV2(api_key="invalid_key_for_testing")
        results, rerank_used = rerank_chunks(QUESTION, FAKE_CHUNKS, top_n=3)

        print(f"rerank_used = {rerank_used}  (expected: False)")
        print("No exception raised — fallback worked correctly")
        print("Results (RRF order preserved):")
        _print_results(results)

        assert not rerank_used, "Expected rerank_used=False on failure"
        assert len(results) == 3, f"Expected 3 results, got {len(results)}"
        # First three in fallback should match FAKE_CHUNKS[:3] ordering
        assert results[0]["document_id"] == FAKE_CHUNKS[0]["document_id"]
        print("\nAll assertions passed.")
    finally:
        reranking_module._client = original_client
        print("Original Cohere client restored.")


def main() -> None:
    test_normal_path()
    test_failure_fallback()


if __name__ == "__main__":
    main()
