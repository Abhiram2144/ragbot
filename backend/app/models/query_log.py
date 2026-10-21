import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class QueryLog(Base):
    __tablename__ = "query_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    kb_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_bases.id"), nullable=False, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retrieved_chunk_ids: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    search_mode: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    rerank_used: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    # {rewrite_ms, embed_query_ms, retrieve_ms, rerank_ms, generate_ms, total_ms}
    # — null per-key for any stage that didn't run under this search_mode.
    stage_latencies: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # list of {chunk_id, document_id, dense_score, sparse_score, rrf_score,
    # rerank_score, final_rank} — per-key null for scores that don't apply.
    chunk_scores: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    estimated_cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # "up" | "down" | null.
    feedback: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    feedback_reason: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
