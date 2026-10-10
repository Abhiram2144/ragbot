import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str
    stream: bool = False
    search_mode: Literal["dense", "hybrid"] = "hybrid"


class AnswerSource(BaseModel):
    marker: str
    document_id: str
    chunk_text: str


class AnswerResponse(BaseModel):
    answer: str
    sources: list[AnswerSource]
    query_log_id: str


class FeedbackRequest(BaseModel):
    feedback: Literal["up", "down"]


class FeedbackResponse(BaseModel):
    id: uuid.UUID
    feedback: Optional[str]


# ─── Query history / trace (Phase 6) ────────────────────────────────────────


class QueryLogListItem(BaseModel):
    id: uuid.UUID
    question: str
    created_at: datetime
    search_mode: Optional[str]
    latency_ms: Optional[int]
    feedback: Optional[str]

    class Config:
        from_attributes = True


class QueryLogListResponse(BaseModel):
    items: list[QueryLogListItem]
    total: int
    limit: int
    offset: int


class ChunkScoreEntry(BaseModel):
    chunk_id: Optional[str] = None
    document_id: str
    dense_score: Optional[float] = None
    sparse_score: Optional[float] = None
    rrf_score: Optional[float] = None
    rerank_score: Optional[float] = None
    final_rank: int


class QueryLogDetail(BaseModel):
    id: uuid.UUID
    question: str
    prompt: Optional[list[dict]]
    response: Optional[str]
    stage_latencies: Optional[dict]
    chunk_scores: Optional[list[ChunkScoreEntry]]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    estimated_cost_usd: Optional[float]
    search_mode: Optional[str]
    feedback: Optional[str]
    created_at: datetime
