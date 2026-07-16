from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from datetime import date
from typing import List, Optional

from app.database import get_session
from app.models import CarrierComplianceRecord, User, Org
from app.auth import get_current_user

router = APIRouter(prefix="/compliance", tags=["compliance"])

class ComplianceUpdateRequest(BaseModel):
    insurance_expiry: date
    authority_status: str  # active | suspended | revoked
    approved_equipment: List[str]
    approved_commodities: List[str]

@router.get("/carriers", response_model=List[Org])
def list_carrier_organizations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Any authenticated user can view carriers (for assignment dropdown)
    carriers = session.exec(select(Org).where(Org.type == "carrier")).all()
    return carriers

@router.get("/{carrier_org_id}", response_model=CarrierComplianceRecord)
def get_compliance_record(
    carrier_org_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Check permissions
    if current_user.org.type == "broker":
        # Brokers can view any carrier compliance record
        pass
    elif current_user.org.type == "carrier":
        if current_user.org_id != carrier_org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: cannot view another carrier's compliance record"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: shippers cannot view compliance records"
        )
        
    record = session.exec(
        select(CarrierComplianceRecord).where(CarrierComplianceRecord.carrier_org_id == carrier_org_id)
    ).first()
    
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compliance record not found for this carrier"
        )
    return record

@router.post("/{carrier_org_id}", response_model=CarrierComplianceRecord, status_code=status.HTTP_201_CREATED)
def create_compliance_record(
    carrier_org_id: int,
    req: ComplianceUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Only carrier admins can create compliance record for their own org
    if current_user.org.type != "carrier" or current_user.org_id != carrier_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: only carrier users can update their compliance record"
        )
        
    # Check if user is Admin
    if not current_user.role or "staff.manage" not in current_user.role.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Carrier Admin ('staff.manage' permission) required to edit compliance record"
        )
        
    # Check if record already exists
    existing = session.exec(
        select(CarrierComplianceRecord).where(CarrierComplianceRecord.carrier_org_id == carrier_org_id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Compliance record already exists for this carrier, use PATCH instead"
        )
        
    record = CarrierComplianceRecord(
        carrier_org_id=carrier_org_id,
        insurance_expiry=req.insurance_expiry,
        authority_status=req.authority_status,
        approved_equipment=req.approved_equipment,
        approved_commodities=req.approved_commodities
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record

@router.patch("/{carrier_org_id}", response_model=CarrierComplianceRecord)
def update_compliance_record(
    carrier_org_id: int,
    req: ComplianceUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Only carrier admins can update compliance record for their own org
    if current_user.org.type != "carrier" or current_user.org_id != carrier_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: only carrier users can update their compliance record"
        )
        
    # Check if user is Admin
    if not current_user.role or "staff.manage" not in current_user.role.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Carrier Admin ('staff.manage' permission) required to edit compliance record"
        )
        
    record = session.exec(
        select(CarrierComplianceRecord).where(CarrierComplianceRecord.carrier_org_id == carrier_org_id)
    ).first()
    
    if not record:
        # Create it if it doesn't exist
        record = CarrierComplianceRecord(
            carrier_org_id=carrier_org_id,
            insurance_expiry=req.insurance_expiry,
            authority_status=req.authority_status,
            approved_equipment=req.approved_equipment,
            approved_commodities=req.approved_commodities
        )
        session.add(record)
    else:
        record.insurance_expiry = req.insurance_expiry
        record.authority_status = req.authority_status
        record.approved_equipment = req.approved_equipment
        record.approved_commodities = req.approved_commodities
        session.add(record)
        
    session.commit()
    session.refresh(record)
    return record
