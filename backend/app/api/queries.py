import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models.query_log import QueryLog
from app.schemas.query import FeedbackRequest, FeedbackResponse

router = APIRouter(prefix="/queries", tags=["queries"])


@router.patch("/{query_log_id}/feedback", response_model=FeedbackResponse)
def set_feedback(
    query_log_id: uuid.UUID,
    body: FeedbackRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Not KB-scoped (no kb_id in the path), so tenant ownership is checked
    # directly against query_logs.org_id — same pattern as get_kb_or_404,
    # just without a KB dependency to carry it.
    row = (
        db.query(QueryLog)
        .filter(QueryLog.id == query_log_id, QueryLog.org_id == current_user.org_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Query log not found")

    if row.feedback != body.feedback or row.feedback_reason != body.reason:
        row.feedback = body.feedback
        row.feedback_reason = body.reason
        db.commit()
        db.refresh(row)

    return FeedbackResponse(id=row.id, feedback=row.feedback, reason=row.feedback_reason)
