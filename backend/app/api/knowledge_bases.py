import json
import time
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, get_kb_or_404
from app.middleware.rate_limit import enforce_query_rate_limit
from app.models.knowledge_base import KnowledgeBase
from app.models.query_log import QueryLog
from app.schemas.analytics import AnalyticsResponse, DailyAnalytics
from app.schemas.knowledge_base import KnowledgeBaseCreate, KnowledgeBaseResponse, KnowledgeBaseUpdate
from app.schemas.query import (
    AnswerResponse,
    AnswerSource,
    QueryLogDetail,
    QueryLogListItem,
    QueryLogListResponse,
    QueryRequest,
)
from app.services.cost_calculator import estimate_cost
from app.services.embedding import embed_query, sparse_embed_query
from app.services.generation import generate_answer, generate_answer_stream, rewrite_query
from app.services.query_logging import log_query
from app.services.reranking import rerank_chunks
from app.services.vector_store import hybrid_search_chunks, search_chunks

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


def _approx_tokens(text: str) -> int:
    """Rough token count (~4 chars/token for English) — embed_query() doesn't
    surface real usage today, so this is an approximation for cost estimation
    only, not an exact count."""
    return max(1, len(text) // 4)


def _chunk_scores(hits: list[dict], search_mode: str) -> list[dict]:
    """Per-chunk retrieval scores for query_logs.chunk_scores.

    search_chunks() (dense) only ever returns a "score" key (cosine
    similarity) — it's intentionally unmodified, so dense_score is read
    from there for search_mode=dense. hybrid_search_chunks()/rerank_chunks()
    already attach dense_score/sparse_score/rrf_score/rerank_score directly;
    whichever of those didn't run is simply absent (-> None via .get()).
    """
    scores = []
    for rank, h in enumerate(hits, start=1):
        dense_score = h["score"] if search_mode == "dense" else h.get("dense_score")
        scores.append(
            {
                "chunk_id": h.get("chunk_id"),
                "document_id": h["document_id"],
                "dense_score": dense_score,
                "sparse_score": h.get("sparse_score"),
                "rrf_score": h.get("rrf_score"),
                "rerank_score": h.get("rerank_score"),
                "final_rank": rank,
            }
        )
    return scores


def _retrieve(
    question: str,
    search_mode: str,
    org_id: str,
    kb_id: str,
) -> tuple[list[dict], bool | None, dict]:
    """Run retrieval for the given search_mode.

    Returns (hits, rerank_used, stage_latencies).
    rerank_used is None for dense (not applicable), True/False for hybrid.
    stage_latencies has keys rewrite_ms/embed_query_ms/retrieve_ms/rerank_ms
    (each ms, rounded to 1 decimal) — None for any stage that didn't run.
    """
    if search_mode == "dense":
        embed_start = time.perf_counter()
        vector = embed_query(question)
        embed_query_ms = (time.perf_counter() - embed_start) * 1000

        retrieve_start = time.perf_counter()
        hits = search_chunks(
            org_id=org_id,
            kb_id=kb_id,
            query_vector=vector,
            top_k=settings.TOP_K_RETRIEVAL,
        )
        retrieve_ms = (time.perf_counter() - retrieve_start) * 1000

        stage_latencies = {
            "rewrite_ms": None,
            "embed_query_ms": round(embed_query_ms, 1),
            "retrieve_ms": round(retrieve_ms, 1),
            "rerank_ms": None,
        }
        return hits, None, stage_latencies

    # hybrid path
    rewrite_start = time.perf_counter()
    rewritten = rewrite_query(question)
    rewrite_ms = (time.perf_counter() - rewrite_start) * 1000

    embed_start = time.perf_counter()
    dense_vec = embed_query(rewritten)
    sparse_vec = sparse_embed_query(rewritten)
    embed_query_ms = (time.perf_counter() - embed_start) * 1000

    retrieve_start = time.perf_counter()
    candidates = hybrid_search_chunks(
        org_id=org_id,
        kb_id=kb_id,
        dense_vector=dense_vec,
        sparse_vector=sparse_vec,
        top_k=settings.RERANK_TOP_N,
    )
    retrieve_ms = (time.perf_counter() - retrieve_start) * 1000

    rerank_start = time.perf_counter()
    hits, rerank_used = rerank_chunks(question, candidates, top_n=settings.TOP_K_RETRIEVAL)
    rerank_ms = (time.perf_counter() - rerank_start) * 1000

    stage_latencies = {
        "rewrite_ms": round(rewrite_ms, 1),
        "embed_query_ms": round(embed_query_ms, 1),
        "retrieve_ms": round(retrieve_ms, 1),
        "rerank_ms": round(rerank_ms, 1),
    }
    return hits, rerank_used, stage_latencies


def _sse_events(
    question: str,
    hits: list[dict],
    org_id: uuid.UUID,
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    start: float,
    search_mode: str,
    rerank_used: bool | None,
    stage_latencies: dict,
    embedding_tokens: int,
) -> Iterator[str]:
    generate_start = time.perf_counter()
    for event in generate_answer_stream(question, hits):
        if event["type"] == "token":
            yield f"data: {json.dumps({'type': 'token', 'text': event['text']})}\n\n"
        elif event["type"] == "done":
            generate_ms = (time.perf_counter() - generate_start) * 1000
            total_ms = int((time.monotonic() - start) * 1000)
            stage_latencies = {
                **stage_latencies,
                "generate_ms": round(generate_ms, 1),
                "total_ms": total_ms,
            }
            query_log_id = log_query(
                org_id=org_id,
                kb_id=kb_id,
                user_id=user_id,
                question=question,
                prompt=event["prompt"],
                response=event["answer"],
                retrieved_chunk_ids=_chunk_refs(hits),
                input_tokens=event["input_tokens"],
                output_tokens=event["output_tokens"],
                latency_ms=total_ms,
                search_mode=search_mode,
                rerank_used=rerank_used,
                stage_latencies=stage_latencies,
                chunk_scores=_chunk_scores(hits, search_mode),
                estimated_cost_usd=estimate_cost(
                    input_tokens=event["input_tokens"],
                    output_tokens=event["output_tokens"],
                    embedding_tokens=embedding_tokens,
                    rerank_calls=1 if rerank_used is not None else 0,
                ),
            )
            # Send the client-safe subset — prompt stays server-side, but the
            # client needs query_log_id to submit feedback against this answer.
            yield f"data: {json.dumps({'type': 'done', 'sources': event['sources'], 'query_log_id': str(query_log_id)})}\n\n"


@router.post("/{kb_id}/query", response_model=AnswerResponse)
def query_kb(
    body: QueryRequest,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    current_user: CurrentUser = Depends(get_current_user),
    _rate_limit: None = Depends(enforce_query_rate_limit),
):
    start = time.monotonic()
    hits, rerank_used, stage_latencies = _retrieve(
        question=body.question,
        search_mode=body.search_mode,
        org_id=str(current_user.org_id),
        kb_id=str(kb.id),
    )
    # Only the dense-embedded query text costs an OpenAI embedding call;
    # sparse (BM25) embedding is local/free. Approximate, see _approx_tokens.
    embedding_tokens = _approx_tokens(body.question)

    if body.stream:
        return StreamingResponse(
            _sse_events(
                body.question, hits,
                current_user.org_id, kb.id, current_user.id,
                start, body.search_mode, rerank_used,
                stage_latencies, embedding_tokens,
            ),
            media_type="text/event-stream",
        )

    generate_start = time.perf_counter()
    result = generate_answer(body.question, hits)
    generate_ms = (time.perf_counter() - generate_start) * 1000
    total_ms = int((time.monotonic() - start) * 1000)
    stage_latencies = {**stage_latencies, "generate_ms": round(generate_ms, 1), "total_ms": total_ms}

    query_log_id = log_query(
        org_id=current_user.org_id,
        kb_id=kb.id,
        user_id=current_user.id,
        question=body.question,
        prompt=result["prompt"],
        response=result["answer"],
        retrieved_chunk_ids=_chunk_refs(hits),
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
        latency_ms=total_ms,
        search_mode=body.search_mode,
        rerank_used=rerank_used,
        stage_latencies=stage_latencies,
        chunk_scores=_chunk_scores(hits, body.search_mode),
        estimated_cost_usd=estimate_cost(
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            embedding_tokens=embedding_tokens,
            rerank_calls=1 if rerank_used is not None else 0,
        ),
    )
    return AnswerResponse(
        answer=result["answer"],
        sources=[AnswerSource(**s) for s in result["sources"]],
        query_log_id=str(query_log_id),
    )


def _truncate(text: str, n: int) -> str:
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


@router.get("/{kb_id}/queries", response_model=QueryLogListResponse)
def list_query_logs(
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    base = db.query(QueryLog).filter(QueryLog.kb_id == kb.id)
    total = base.count()
    rows = (
        base.order_by(QueryLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        QueryLogListItem(
            id=row.id,
            question=_truncate(row.question, 100),
            created_at=row.created_at,
            search_mode=row.search_mode,
            latency_ms=row.latency_ms,
            feedback=row.feedback,
        )
        for row in rows
    ]
    return QueryLogListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{kb_id}/queries/{query_log_id}", response_model=QueryLogDetail)
def get_query_log(
    query_log_id: uuid.UUID,
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
):
    row = (
        db.query(QueryLog)
        .filter(QueryLog.id == query_log_id, QueryLog.kb_id == kb.id)
        .first()
    )
    if row is None:
        # kb is already org-scoped (get_kb_or_404), so this also covers a
        # query_log_id that belongs to a different KB/org — same
        # tenant-ownership pattern as get_kb_or_404 itself.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Query log not found")

    prompt = None
    if row.prompt:
        try:
            prompt = json.loads(row.prompt)
        except (json.JSONDecodeError, TypeError):
            prompt = None

    return QueryLogDetail(
        id=row.id,
        question=row.question,
        prompt=prompt,
        response=row.response,
        stage_latencies=row.stage_latencies,
        chunk_scores=row.chunk_scores,
        input_tokens=row.input_tokens,
        output_tokens=row.output_tokens,
        estimated_cost_usd=row.estimated_cost_usd,
        search_mode=row.search_mode,
        feedback=row.feedback,
        created_at=row.created_at,
    )


@router.get("/{kb_id}/analytics", response_model=AnalyticsResponse)
def get_analytics(
    kb: KnowledgeBase = Depends(get_kb_or_404),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
):
    """Aggregate production query traffic over the last N days.

    Distinct from the Phase 5 eval runner: this reflects real user
    queries logged to query_logs, not a controlled eval set.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    base = db.query(QueryLog).filter(QueryLog.kb_id == kb.id, QueryLog.created_at >= since)

    total_queries = base.count()

    avg_latency_ms = (
        db.query(func.avg(QueryLog.latency_ms))
        .filter(QueryLog.kb_id == kb.id, QueryLog.created_at >= since, QueryLog.latency_ms.isnot(None))
        .scalar()
    )
    avg_cost_usd = (
        db.query(func.avg(QueryLog.estimated_cost_usd))
        .filter(QueryLog.kb_id == kb.id, QueryLog.created_at >= since, QueryLog.estimated_cost_usd.isnot(None))
        .scalar()
    )

    up_count = base.filter(QueryLog.feedback == "up").count()
    down_count = base.filter(QueryLog.feedback == "down").count()
    feedback_ratio = up_count / (up_count + down_count) if (up_count + down_count) > 0 else None

    day_col = func.date(QueryLog.created_at)
    daily_rows = (
        db.query(day_col.label("day"), func.count(QueryLog.id), func.avg(QueryLog.latency_ms))
        .filter(QueryLog.kb_id == kb.id, QueryLog.created_at >= since)
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )
    daily = [
        DailyAnalytics(
            date=str(day),
            query_count=count,
            avg_latency_ms=float(avg_lat) if avg_lat is not None else None,
        )
        for day, count, avg_lat in daily_rows
    ]

    return AnalyticsResponse(
        total_queries=total_queries,
        avg_latency_ms=float(avg_latency_ms) if avg_latency_ms is not None else None,
        avg_cost_usd=float(avg_cost_usd) if avg_cost_usd is not None else None,
        feedback_ratio=feedback_ratio,
        daily=daily,
    )
