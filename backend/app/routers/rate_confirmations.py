from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import List, Dict, Any
from datetime import datetime

from app.database import get_session
from app.models import RateConfirmation, User, Load
from app.auth import require_permission, check_load_access, get_current_user

router = APIRouter(prefix="/loads", tags=["rate_confirmations"])

class AccessorialItem(BaseModel):
    description: str
    amount: float

class RateConfirmationRequest(BaseModel):
    base_rate: float
    accessorials: List[AccessorialItem]

class RateConfirmationResponse(BaseModel):
    id: int
    load_id: int
    version: int
    base_rate: float
    accessorials: List[Dict[str, Any]]
    confirmed_at: datetime
    confirmed_by: int
    confirmed_by_name: str

@router.post("/{load_id}/rate-confirmation", response_model=RateConfirmationResponse, status_code=status.HTTP_201_CREATED)
def create_rate_confirmation(
    load_id: int,
    req: RateConfirmationRequest,
    current_user: User = Depends(require_permission("rate.confirm")),
    session: Session = Depends(get_session)
):
    load = session.get(Load, load_id)
    if not load:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Load not found"
        )
    
    # Check org scoping
    check_load_access(load, current_user)
    
    # Determine the next version
    latest = session.exec(
        select(RateConfirmation)
        .where(RateConfirmation.load_id == load_id)
        .order_by(RateConfirmation.version.desc())
    ).first()
    
    next_version = (latest.version + 1) if latest else 1
    
    rate_conf = RateConfirmation(
        load_id=load_id,
        version=next_version,
        base_rate=req.base_rate,
        accessorials=[item.dict() for item in req.accessorials],
        confirmed_by=current_user.id
    )
    
    session.add(rate_conf)
    session.commit()
    session.refresh(rate_conf)
    
    return RateConfirmationResponse(
        id=rate_conf.id,
        load_id=rate_conf.load_id,
        version=rate_conf.version,
        base_rate=rate_conf.base_rate,
        accessorials=rate_conf.accessorials,
        confirmed_at=rate_conf.confirmed_at,
        confirmed_by=rate_conf.confirmed_by,
        confirmed_by_name=current_user.full_name
    )

@router.get("/{load_id}/rate-confirmations", response_model=List[RateConfirmationResponse])
def get_rate_confirmations(
    load_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    load = session.get(Load, load_id)
    if not load:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Load not found"
        )
        
    check_load_access(load, current_user)
    
    confirmations = session.exec(
        select(RateConfirmation)
        .where(RateConfirmation.load_id == load_id)
        .order_by(RateConfirmation.version.desc())
    ).all()
    
    result = []
    for conf in confirmations:
        conf_user = session.get(User, conf.confirmed_by)
        conf_user_name = conf_user.full_name if conf_user else "Unknown User"
        result.append(
            RateConfirmationResponse(
                id=conf.id,
                load_id=conf.load_id,
                version=conf.version,
                base_rate=conf.base_rate,
                accessorials=conf.accessorials,
                confirmed_at=conf.confirmed_at,
                confirmed_by=conf.confirmed_by,
                confirmed_by_name=conf_user_name
            )
        )
        
    return result
