from typing import Optional

from pydantic import BaseModel


class DailyAnalytics(BaseModel):
    date: str
    query_count: int
    avg_latency_ms: Optional[float]


class AnalyticsResponse(BaseModel):
    total_queries: int
    avg_latency_ms: Optional[float]
    avg_cost_usd: Optional[float]
    # up / (up + down); null when no feedback has been given yet.
    feedback_ratio: Optional[float]
    daily: list[DailyAnalytics]
