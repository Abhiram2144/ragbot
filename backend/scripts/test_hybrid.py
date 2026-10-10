"""
Smoke-test for hybrid_search_chunks().

Embeds a hardcoded query both dense and sparse, calls hybrid_search_chunks()
directly, and prints the RRF-merged results.

Prerequisites:
  - Qdrant running (docker compose up -d)
  - At least one document indexed (status='complete')
  - ORG_ID and KB_ID must be valid UUIDs from your database

Run from the backend/ directory:

    ORG_ID=<uuid> KB_ID=<uuid> python scripts/test_hybrid.py

Or edit QUERY / ORG_ID / KB_ID inline below.
"""

import os
import sys

# Allow running from backend/ without installing the package.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.embedding import embed_query, sparse_embed_query
from app.services.vector_store import hybrid_search_chunks

QUERY = "What is the main topic of the uploaded documents?"
ORG_ID = os.environ.get("ORG_ID", "")
KB_ID = os.environ.get("KB_ID", "")
TOP_K = 5


def main() -> None:
    if not ORG_ID or not KB_ID:
        print("ERROR: set ORG_ID and KB_ID environment variables (valid UUIDs from your DB).")
        sys.exit(1)

    print(f"Query : {QUERY!r}")
    print(f"Org   : {ORG_ID}")
    print(f"KB    : {KB_ID}")
    print(f"Top-K : {TOP_K}")
    print()

    print("Embedding query (dense)...")
    dense_vec = embed_query(QUERY)
    print(f"  Dense vector dim: {len(dense_vec)}")

    print("Embedding query (sparse / BM25)...")
    sparse_vec = sparse_embed_query(QUERY)
    print(f"  Sparse non-zero terms: {len(sparse_vec['indices'])}")
    print()

    print("Running hybrid_search_chunks()...")
    results = hybrid_search_chunks(
        org_id=ORG_ID,
        kb_id=KB_ID,
        dense_vector=dense_vec,
        sparse_vector=sparse_vec,
        top_k=TOP_K,
    )

    if not results:
        print("No results returned. Make sure documents are indexed for this KB.")
        sys.exit(0)

    print(f"{'Rank':<5} {'RRF Score':<12} {'Doc ID':<38} {'Chunk':>5}  Text preview")
    print("-" * 100)
    for rank, hit in enumerate(results, start=1):
        preview = hit["chunk_text"][:60].replace("\n", " ")
        print(
            f"{rank:<5} {hit['score']:<12.6f} {hit['document_id']:<38} "
            f"{hit['chunk_index']:>5}  {preview!r}"
        )


if __name__ == "__main__":
    main()
