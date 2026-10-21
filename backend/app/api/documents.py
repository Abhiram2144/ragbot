import uuid
from pathlib import Path
from typing import List

from datetime import date
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_kb_or_404
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase
from app.schemas.document import DocumentResponse, DocumentUpdate
from app.services.vector_store import update_document_publication_status
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
    department: str = Form(default="HR"),
    owner: Optional[str] = Form(default=None),
    effective_date: Optional[date] = Form(default=None),
    review_date: Optional[date] = Form(default=None),
    publication_status: Literal["draft", "published", "archived"] = Form(default="published"),
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
        publication_status=publication_status,
        department=department.strip() or "HR",
        owner=owner.strip() if owner else None,
        effective_date=effective_date,
        review_date=review_date,
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
    publication_status: Optional[Literal["draft", "published", "archived"]] = Query(default=None),
    stale_only: bool = Query(default=False),
):
    query = db.query(Document).filter(Document.kb_id == kb.id)
    if publication_status:
        query = query.filter(Document.publication_status == publication_status)
    if stale_only:
        query = query.filter(Document.review_date.isnot(None), Document.review_date < date.today())
    return query.order_by(Document.created_at.desc()).all()


@router.get("/{kb_id}/documents/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: uuid.UUID,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    return _get_doc_or_404(document_id, kb, db)


@router.patch("/{kb_id}/documents/{document_id}", response_model=DocumentResponse)
def update_document(
    body: DocumentUpdate,
    document_id: uuid.UUID,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    doc = _get_doc_or_404(document_id, kb, db)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(doc, field, value)
    db.commit()
    db.refresh(doc)

    if "publication_status" in updates:
        update_document_publication_status(
            org_id=str(doc.org_id),
            kb_id=str(doc.kb_id),
            document_id=str(doc.id),
            publication_status=doc.publication_status,
        )
    return doc


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
