import uuid
from datetime import datetime

from pydantic import BaseModel


class EvaluationRunRequest(BaseModel):
    use_faithfulness: bool = False


class EvaluationRunResponse(BaseModel):
    id: uuid.UUID
    search_mode: str
    aggregate_metrics: dict
    created_at: datetime

    model_config = {"from_attributes": True}