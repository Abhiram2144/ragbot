import uuid
from datetime import datetime

from pydantic import BaseModel


class OrgResponse(BaseModel):
    id: uuid.UUID
    name: str
    plan: str
    created_at: datetime


class MemberResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
