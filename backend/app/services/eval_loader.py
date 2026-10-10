"""Load and validate the hand-labeled eval set (backend/eval/eval_set.yaml).

Only loading + validation lives here. Metrics calculation and the eval
runner are 5.2/5.3, built separately.
"""

from pathlib import Path
from uuid import UUID

import yaml
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase


class EvalEntry(BaseModel):
    id: str
    kb_id: UUID
    question: str
    expected_document_id: UUID
    expected_chunk_id: UUID
    notes: str


def load_eval_set(path: str | Path) -> list[EvalEntry]:
    """Parse, validate, and cross-check an eval_set.yaml file.

    Raises ValueError with a clear, entry-identifying message if:
      - the file is missing/unreadable or not the expected shape,
      - any entry is missing a required field or has the wrong type,
      - any entry's `id` is a duplicate,
      - any entry's kb_id or expected_document_id doesn't exist in the DB,
      - expected_document_id exists but belongs to a different kb_id.
    """
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"Eval set not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    if not isinstance(raw, dict) or "entries" not in raw:
        raise ValueError(
            f"{path}: expected a top-level 'entries:' list, got {type(raw).__name__}"
        )

    raw_entries = raw["entries"]
    if not isinstance(raw_entries, list):
        raise ValueError(f"{path}: 'entries' must be a list, got {type(raw_entries).__name__}")

    entries: list[EvalEntry] = []
    seen_ids: set[str] = set()

    for i, raw_entry in enumerate(raw_entries):
        entry_label = raw_entry.get("id", f"<entry #{i}>") if isinstance(raw_entry, dict) else f"<entry #{i}>"
        try:
            entry = EvalEntry.model_validate(raw_entry)
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in exc.errors()
            )
            raise ValueError(f"{path}: entry {entry_label} is invalid — {problems}") from exc

        if entry.id in seen_ids:
            raise ValueError(f"{path}: duplicate entry id '{entry.id}'")
        seen_ids.add(entry.id)
        entries.append(entry)

    _validate_references(entries, path)
    return entries


def _validate_references(entries: list[EvalEntry], path: Path) -> None:
    if not entries:
        return

    kb_ids = {e.kb_id for e in entries}
    document_ids = {e.expected_document_id for e in entries}

    db: Session = SessionLocal()
    try:
        existing_kb_ids = {
            kb.id for kb in db.query(KnowledgeBase.id).filter(KnowledgeBase.id.in_(kb_ids)).all()
        }
        documents = (
            db.query(Document)
            .filter(Document.id.in_(document_ids))
            .all()
        )
        document_kb_by_id = {doc.id: doc.kb_id for doc in documents}
    finally:
        db.close()

    for entry in entries:
        if entry.kb_id not in existing_kb_ids:
            raise ValueError(
                f"{path}: entry '{entry.id}' references kb_id={entry.kb_id}, "
                "which does not exist in the database"
            )
        if entry.expected_document_id not in document_kb_by_id:
            raise ValueError(
                f"{path}: entry '{entry.id}' references expected_document_id="
                f"{entry.expected_document_id}, which does not exist in the database"
            )
        actual_kb_id = document_kb_by_id[entry.expected_document_id]
        if actual_kb_id != entry.kb_id:
            raise ValueError(
                f"{path}: entry '{entry.id}' has kb_id={entry.kb_id} but "
                f"expected_document_id={entry.expected_document_id} belongs to "
                f"kb_id={actual_kb_id} instead"
            )
