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
) -> None:
    db = SessionLocal()
    try:
        db.add(
            QueryLog(
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
            )
        )
        db.commit()
    finally:
        db.close()
