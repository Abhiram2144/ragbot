import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_kb_or_404
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase
from app.schemas.document import DocumentResponse
from app.workers.tasks import process_document

router = APIRouter(prefix="/knowledge-bases", tags=["documents"])


def _get_doc_or_404(
    document_id: uuid.UUID,
    kb: KnowledgeBase,
    db: Session,
) -> Document:
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.kb_id == kb.id)
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


@router.post("/{kb_id}/documents", response_model=DocumentResponse, status_code=201)
def upload_document(
    file: UploadFile,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    safe_name = Path(file.filename or "upload").name
    suffix = Path(safe_name).suffix.lstrip(".").lower()
    if suffix not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Extension '.{suffix}' is not allowed. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    contents = file.file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB}MB size limit",
        )

    document_id = uuid.uuid4()
    save_dir = Path(settings.UPLOAD_DIR) / str(kb.org_id) / str(kb.id)
    save_dir.mkdir(parents=True, exist_ok=True)
    file_path = save_dir / f"{document_id}_{safe_name}"
    file_path.write_bytes(contents)

    doc = Document(
        id=document_id,
        org_id=kb.org_id,
        kb_id=kb.id,
        filename=safe_name,
        file_path=str(file_path),
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    process_document.delay(str(document_id))

    return doc


@router.get("/{kb_id}/documents", response_model=List[DocumentResponse])
def list_documents(
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    return db.query(Document).filter(Document.kb_id == kb.id).all()


@router.get("/{kb_id}/documents/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: uuid.UUID,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    return _get_doc_or_404(document_id, kb, db)


@router.delete("/{kb_id}/documents/{document_id}", status_code=204)
def delete_document(
    document_id: uuid.UUID,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(document_id, kb, db)

    file_path = Path(doc.file_path)
    if file_path.exists():
        file_path.unlink()

    db.delete(doc)
    db.commit()
