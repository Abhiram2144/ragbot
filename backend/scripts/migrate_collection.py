"""
Phase 4 — one-time Qdrant collection migration.

Recreates the 'chunks' collection with the Phase 4 named-vector schema:
  vectors_config       = {"dense":  VectorParams(size=1536, Distance.COSINE)}
  sparse_vectors_config = {"sparse": SparseVectorParams()}

WARNING
-------
This deletes ALL existing indexed vectors. Every document with status
'complete' must be re-indexed afterward before queries will return results.

Run from the backend/ directory:

    python scripts/migrate_collection.py --confirm

Verify the result with Qdrant's REST API:

    curl http://localhost:6333/collections/chunks | python -m json.tool

Look for "vectors" containing "dense" and "sparse_vectors" containing
"sparse" in the response. The "status" field should be "green".
"""

import argparse
import sys

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, SparseVectorParams, VectorParams

# Import via app so we pick up the same .env as the rest of the backend.
from app.config import settings

_COLLECTION = "chunks"
_VECTOR_SIZE = 1536

_SEPARATOR = "=" * 68


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate Qdrant 'chunks' collection to Phase 4 named-vector schema.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually perform the migration. Required — prevents accidental runs.",
    )
    args = parser.parse_args()

    print()
    print(_SEPARATOR)
    print("  PHASE 4 — QDRANT COLLECTION MIGRATION")
    print(_SEPARATOR)
    print()
    print("  Target collection : chunks")
    print(f"  Qdrant URL        : {settings.QDRANT_URL}")
    print()
    print("  What this does:")
    print("    1. DELETES the existing 'chunks' collection and all its vectors.")
    print("    2. Recreates 'chunks' with named dense + sparse vector slots.")
    print()
    print("  After this script completes you MUST re-index all documents.")
    print("  Documents with status 'complete' currently return results;")
    print("  after migration they will return nothing until re-indexed.")
    print()
    print("  Re-indexing options:")
    print("    a) Re-upload documents via the UI (triggers the Celery worker).")
    print("    b) Run: python scripts/reindex_all.py  (written in step 4.2).")
    print()

    if not args.confirm:
        print("  DRY RUN — pass --confirm to execute.")
        print()
        sys.exit(0)

    client = QdrantClient(url=settings.QDRANT_URL)

    # ── Delete existing collection ────────────────────────────────────────────
    existing = {c.name for c in client.get_collections().collections}
    if _COLLECTION in existing:
        print(f"  Deleting '{_COLLECTION}'...")
        client.delete_collection(_COLLECTION)
        print("  Deleted.")
    else:
        print(f"  Collection '{_COLLECTION}' not found — will create fresh.")

    # ── Create with named vector schema ───────────────────────────────────────
    print(f"  Creating '{_COLLECTION}' with named dense + sparse vectors...")
    client.create_collection(
        collection_name=_COLLECTION,
        vectors_config={
            "dense": VectorParams(size=_VECTOR_SIZE, distance=Distance.COSINE),
        },
        sparse_vectors_config={
            "sparse": SparseVectorParams(),
        },
    )
    print("  Created.")
    print()
    print(_SEPARATOR)
    print("  Migration complete. Next steps:")
    print()
    print("  1. Verify the new schema:")
    print(f"       curl {settings.QDRANT_URL}/collections/{_COLLECTION} | python -m json.tool")
    print()
    print("  2. Re-index all documents (no results until this is done).")
    print()
    print(_SEPARATOR)
    print()


if __name__ == "__main__":
    main()
