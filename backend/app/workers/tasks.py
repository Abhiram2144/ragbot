import logging
import os
import time

from app.celery_app import celery
from app.database import SessionLocal
from app.models.document import Document
from app.services import chunking, embedding, vector_store

logger = logging.getLogger(__name__)

_MAX_ERROR_LEN = 2000


@celery.task(name="app.workers.tasks.ping_task")
def ping_task():
    time.sleep(1)
    return {"status": "pong", "worker_pid": os.getpid()}


@celery.task(
    name="app.workers.tasks.process_document",
    bind=True,
    max_retries=2,
)
def process_document(self, document_id: str):
    db = SessionLocal()
    doc = None
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc is None:
            logger.warning("process_document: document %s not found, skipping", document_id)
            return

        doc.status = "processing"
        doc.error_message = None
        db.commit()

        text = chunking.extract_text(doc.file_path, doc.filename)
        chunks = chunking.chunk_text(text)
        dense_vectors = embedding.embed_chunks(chunks)
        sparse_vectors = embedding.sparse_embed_chunks(chunks)

        vector_store.ensure_collection()
        vector_store.index_chunks(
            org_id=str(doc.org_id),
            kb_id=str(doc.kb_id),
            document_id=str(doc.id),
            chunks=chunks,
            dense_vectors=dense_vectors,
            sparse_vectors=sparse_vectors,
        )

        doc.status = "complete"
        doc.error_message = None
        db.commit()

    except Exception as exc:
        if doc is not None:
            doc.status = "failed"
            doc.error_message = str(exc)[:_MAX_ERROR_LEN]
            db.commit()
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)

    finally:
        db.close()
