import json
import time
import uuid
from collections.abc import Iterator
from typing import List

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, get_kb_or_404
from app.models.knowledge_base import KnowledgeBase
from app.schemas.knowledge_base import KnowledgeBaseCreate, KnowledgeBaseResponse, KnowledgeBaseUpdate
from app.schemas.query import AnswerResponse, AnswerSource, QueryRequest
from app.services.embedding import embed_query
from app.services.generation import generate_answer, generate_answer_stream
from app.services.query_logging import log_query
from app.services.vector_store import search_chunks

router = APIRouter(prefix="/knowledge-bases", tags=["knowledge-bases"])


@router.post("", response_model=KnowledgeBaseResponse, status_code=201)
def create_kb(
    body: KnowledgeBaseCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = KnowledgeBase(org_id=current_user.org_id, **body.model_dump())
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return kb


@router.get("", response_model=List[KnowledgeBaseResponse])
def list_kbs(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(KnowledgeBase).filter(KnowledgeBase.org_id == current_user.org_id).all()


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get_kb(kb: KnowledgeBase = Depends(get_kb_or_404)):
    return kb


@router.patch("/{kb_id}", response_model=KnowledgeBaseResponse)
def update_kb(
    body: KnowledgeBaseUpdate,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(kb, field, value)
    db.commit()
    db.refresh(kb)
    return kb


@router.delete("/{kb_id}", status_code=204)
def delete_kb(
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    db.delete(kb)
    db.commit()


def _chunk_refs(hits: list[dict]) -> list[dict]:
    return [{"document_id": h["document_id"], "chunk_index": h["chunk_index"]} for h in hits]


def _sse_events(
    question: str,
    hits: list[dict],
    org_id: uuid.UUID,
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    start: float,
) -> Iterator[str]:
    for event in generate_answer_stream(question, hits):
        if event["type"] == "token":
            yield f"data: {json.dumps({'type': 'token', 'text': event['text']})}\n\n"
        elif event["type"] == "done":
            # Send the client-safe subset — prompt and answer stay server-side for logging.
            yield f"data: {json.dumps({'type': 'done', 'sources': event['sources']})}\n\n"
            log_query(
                org_id=org_id,
                kb_id=kb_id,
                user_id=user_id,
                question=question,
                prompt=event["prompt"],
                response=event["answer"],
                retrieved_chunk_ids=_chunk_refs(hits),
                input_tokens=event["input_tokens"],
                output_tokens=event["output_tokens"],
                latency_ms=int((time.monotonic() - start) * 1000),
            )


@router.post("/{kb_id}/query", response_model=AnswerResponse)
def query_kb(
    body: QueryRequest,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    current_user: CurrentUser = Depends(get_current_user),
):
    start = time.monotonic()
    vector = embed_query(body.question)
    hits = search_chunks(
        org_id=str(current_user.org_id),
        kb_id=str(kb.id),
        query_vector=vector,
        top_k=settings.TOP_K_RETRIEVAL,
    )

    if body.stream:
        return StreamingResponse(
            _sse_events(body.question, hits, current_user.org_id, kb.id, current_user.id, start),
            media_type="text/event-stream",
        )

    result = generate_answer(body.question, hits)
    log_query(
        org_id=current_user.org_id,
        kb_id=kb.id,
        user_id=current_user.id,
        question=body.question,
        prompt=result["prompt"],
        response=result["answer"],
        retrieved_chunk_ids=_chunk_refs(hits),
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
        latency_ms=int((time.monotonic() - start) * 1000),
    )
    return AnswerResponse(
        answer=result["answer"],
        sources=[AnswerSource(**s) for s in result["sources"]],
    )
