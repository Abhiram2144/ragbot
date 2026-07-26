import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class KnowledgeBaseCreate(BaseModel):
    name: str
    description: Optional[str] = None


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class KnowledgeBaseResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
