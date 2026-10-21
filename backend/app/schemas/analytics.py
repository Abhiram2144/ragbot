from typing import Optional

from pydantic import BaseModel


class DailyAnalytics(BaseModel):
    date: str
    query_count: int
    avg_latency_ms: Optional[float]
    helpful_rate: Optional[float]


class QuestionSignal(BaseModel):
    question: str
    count: int
    query_log_id: str
    kb_id: str
    created_at: str


class KnowledgeBaseSignal(BaseModel):
    kb_id: str
    name: str
    query_count: int


class StaleDocumentSignal(BaseModel):
    document_id: str
    kb_id: str
    filename: str
    review_date: str
    publication_status: str


class AnalyticsResponse(BaseModel):
    total_queries: int
    avg_latency_ms: Optional[float]
    avg_cost_usd: Optional[float]
    # up / (up + down); null when no feedback has been given yet.
    feedback_ratio: Optional[float]
    feedback_reasons: dict[str, int]
    daily: list[DailyAnalytics]
    low_confidence_questions: list[QuestionSignal]
    common_questions: list[QuestionSignal]
    knowledge_bases: list[KnowledgeBaseSignal]
    stale_documents: list[StaleDocumentSignal]
