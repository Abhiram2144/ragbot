from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models.organization import Organization
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.organization import MemberResponse, OrgResponse

router = APIRouter(prefix="/organization", tags=["organization"])


@router.get("", response_model=OrgResponse)
def get_organization(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == current_user.org_id).first()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    sub = db.query(Subscription).filter(Subscription.org_id == current_user.org_id).first()
    return OrgResponse(
        id=org.id,
        name=org.name,
        plan=sub.plan if sub else "free",
        created_at=org.created_at,
    )


@router.get("/members", response_model=List[MemberResponse])
def list_members(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(User)
        .filter(User.org_id == current_user.org_id)
        .order_by(User.created_at)
        .all()
    )
