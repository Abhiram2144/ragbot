"""
Re-index all completed documents into the Phase 4 Qdrant schema.

Prerequisite: scripts/migrate_collection.py --confirm must have been run
first, otherwise the Celery tasks will fail (old unnamed-vector schema).

A Celery worker must be running to process the dispatched tasks:
    celery -A app.celery_app worker --loglevel=info

Run from the backend/ directory:

    python scripts/reindex_all.py

Each document queued will briefly show status "processing" (the normal
Celery task lifecycle) and return to "complete" when the worker finishes.
Documents that fail re-indexing will flip to "failed" with an error message,
consistent with the existing error-handling behaviour.
"""

import logging
import sys

from app.database import SessionLocal
from app.models.document import Document
from app.workers.tasks import process_document

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def main() -> None:
    db = SessionLocal()
    try:
        docs = (
            db.query(Document)
            .filter(Document.status == "complete")
            .order_by(Document.created_at)
            .all()
        )
        count = len(docs)

        if count == 0:
            log.info("No completed documents found — nothing to re-index.")
            sys.exit(0)

        log.info("Queuing %d document(s) for re-indexing...", count)
        for doc in docs:
            process_document.delay(str(doc.id))
            log.info("  queued  %s  %s", doc.id, doc.filename)

        log.info("")
        log.info(
            "%d task(s) dispatched. Monitor the Celery worker for progress.",
            count,
        )
        log.info(
            "Verify with: curl http://localhost:6333/collections/chunks/points/scroll"
            " -d '{\"limit\": 1, \"with_vectors\": true}' | python -m json.tool"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
