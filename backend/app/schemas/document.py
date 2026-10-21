import uuid
from datetime import date, datetime
from typing import Literal
from typing import Optional

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: uuid.UUID
    kb_id: uuid.UUID
    filename: str
    status: str
    publication_status: Literal["draft", "published", "archived"]
    department: str
    owner: Optional[str]
    effective_date: Optional[date]
    review_date: Optional[date]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentUpdate(BaseModel):
    publication_status: Optional[Literal["draft", "published", "archived"]] = None
    department: Optional[str] = None
    owner: Optional[str] = None
    effective_date: Optional[date] = None
    review_date: Optional[date] = None
