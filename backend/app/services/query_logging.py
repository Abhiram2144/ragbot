import json
import uuid

from app.database import SessionLocal
from app.models.query_log import QueryLog


def log_query(
    org_id: uuid.UUID,
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    question: str,
    prompt: list[dict],
    response: str,
    retrieved_chunk_ids: list[dict],
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    search_mode: str | None = None,
    rerank_used: bool | None = None,
    stage_latencies: dict | None = None,
    chunk_scores: list | None = None,
    estimated_cost_usd: float | None = None,
    feedback: str | None = None,
) -> uuid.UUID:
    """Insert one query_logs row. Returns its id, so the caller can hand it
    back to the client (query_log_id) for later feedback submission."""
    db = SessionLocal()
    try:
        query_log = QueryLog(
            org_id=org_id,
            kb_id=kb_id,
            user_id=user_id,
            question=question,
            prompt=json.dumps(prompt),
            response=response,
            retrieved_chunk_ids=retrieved_chunk_ids,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            search_mode=search_mode,
            rerank_used=rerank_used,
            stage_latencies=stage_latencies,
            chunk_scores=chunk_scores,
            estimated_cost_usd=estimated_cost_usd,
            feedback=feedback,
        )
        db.add(query_log)
        db.commit()
        db.refresh(query_log)
        return query_log.id
    finally:
        db.close()
