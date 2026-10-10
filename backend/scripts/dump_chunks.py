"""
Phase 5 eval tooling — dump every indexed chunk in a KB for hand-labeling.

Prints each chunk grouped by source document, with its stable chunk_id
(the Qdrant point id), so you can read through real indexed content and
pick chunks to write eval questions against (see eval/eval_set.yaml).

This does NOT write anything — read-only against Postgres + Qdrant.

Run from the backend/ directory:

    python scripts/dump_chunks.py <kb_id>
"""

import argparse
import sys
import textwrap

from app.database import SessionLocal
from app.models.document import Document
from app.services.vector_store import scroll_chunks_for_kb

_TEXT_TRUNCATE = 150


def main() -> None:
    parser = argparse.ArgumentParser(description="Dump indexed chunks for a KB.")
    parser.add_argument("kb_id", help="Knowledge base UUID")
    args = parser.parse_args()

    chunks = scroll_chunks_for_kb(args.kb_id)
    if not chunks:
        print(f"No indexed chunks found for kb_id={args.kb_id}.")
        print("(Has the KB been indexed? Check document status / migrate_collection.py.)")
        sys.exit(0)

    db = SessionLocal()
    try:
        doc_ids = {c["document_id"] for c in chunks}
        docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
        filename_by_id = {str(d.id): d.filename for d in docs}
    finally:
        db.close()

    # Group by document, then order chunks within each document by chunk_index.
    by_doc: dict[str, list[dict]] = {}
    for c in chunks:
        by_doc.setdefault(c["document_id"], []).append(c)

    total = 0
    for document_id, doc_chunks in by_doc.items():
        doc_chunks.sort(key=lambda c: c["chunk_index"])
        filename = filename_by_id.get(document_id, "<unknown document — not in Postgres>")
        print("=" * 78)
        print(f"document: {filename}")
        print(f"document_id: {document_id}")
        print("=" * 78)
        for c in doc_chunks:
            text = " ".join(c["chunk_text"].split())  # collapse whitespace/newlines
            preview = textwrap.shorten(text, width=_TEXT_TRUNCATE, placeholder=" ...")
            print(f"  chunk_id: {c['chunk_id']}  (chunk_index={c['chunk_index']})")
            print(f"    {preview}")
            print()
            total += 1

    print("-" * 78)
    print(f"{total} chunk(s) across {len(by_doc)} document(s) for kb_id={args.kb_id}")


if __name__ == "__main__":
    main()
