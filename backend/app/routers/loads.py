from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime, date

from app.database import get_session
from app.models import Load, User, LoadAuditEvent, RateConfirmation, Org
from app.auth import get_current_user, require_permission, check_load_access

router = APIRouter(prefix="/loads", tags=["loads"])

class LoadCreateRequest(BaseModel):
    shipper_id: int
    origin: str
    destination: str
    commodity: str
    equipment_type: str

class CarrierAssignRequest(BaseModel):
    carrier_org_id: int

class TransitionRequest(BaseModel):
    to_state: str
    note: Optional[str] = None

class AuditEventResponse(BaseModel):
    id: int
    load_id: int
    from_state: str
    to_state: str
    actor_id: int
    actor_name: str
    timestamp: datetime
    note: Optional[str] = None

class LoadDetailResponse(BaseModel):
    id: int
    shipper_id: int
    shipper_name: str
    broker_org_id: int
    broker_name: str
    carrier_org_id: Optional[int] = None
    carrier_name: Optional[str] = None
    state: str
    compliance_flag: bool
    origin: str
    destination: str
    commodity: str
    equipment_type: str
    pod_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    audit_events: List[AuditEventResponse] = []
    latest_rate_confirmation: Optional[float] = None

STATES_ORDER = [
    "Posted",
    "Carrier Assigned",
    "Rate Confirmed",
    "Dispatched",
    "In Transit",
    "Delivered",
    "POD Verified",
    "Invoiced/Closed"
]

def verify_carrier_compliance(load: Load, session: Session) -> bool:
    """
    Computes compliance_flag live. Returns True if there's a compliance violation.
    """
    if not load.carrier_org_id:
        return False
        
    from app.models import CarrierComplianceRecord
    record = session.exec(
        select(CarrierComplianceRecord)
        .where(CarrierComplianceRecord.carrier_org_id == load.carrier_org_id)
    ).first()
    
    # If no compliance record exists, it is non-compliant
    if not record:
        return True
        
    # Check authority status
    if record.authority_status != "active":
        return True
        
    # Check insurance expiry
    if record.insurance_expiry < date.today():
        return True
        
    # Check equipment mismatch (case-insensitive)
    approved_eqs = [eq.lower().strip() for eq in record.approved_equipment]
    if load.equipment_type.lower().strip() not in approved_eqs:
        return True
        
    # Check commodity mismatch (case-insensitive)
    approved_comms = [comm.lower().strip() for comm in record.approved_commodities]
    if load.commodity.lower().strip() not in approved_comms:
        return True
        
    return False

def sync_load_compliance(load: Load, session: Session):
    """
    Helper to live-recompute compliance_flag and sync it to the database if it changed.
    """
    live_flag = verify_carrier_compliance(load, session)
    if load.compliance_flag != live_flag:
        load.compliance_flag = live_flag
        load.updated_at = datetime.utcnow()
        session.add(load)
        session.commit()
        session.refresh(load)

@router.post("", response_model=LoadDetailResponse, status_code=status.HTTP_201_CREATED)
def create_load(
    req: LoadCreateRequest,
    current_user: User = Depends(require_permission("load.create")),
    session: Session = Depends(get_session)
):
    # Verify shipper exists and is actually a shipper
    shipper_user = session.get(User, req.shipper_id)
    if not shipper_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shipper user not found"
        )
    
    shipper_org = session.get(Org, shipper_user.org_id)
    if not shipper_org or shipper_org.type != "shipper":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User selected is not registered under a shipper organization"
        )
        
    load = Load(
        shipper_id=req.shipper_id,
        broker_org_id=current_user.org_id,
        state="Posted",
        compliance_flag=False,
        origin=req.origin,
        destination=req.destination,
        commodity=req.commodity,
        equipment_type=req.equipment_type
    )
    
    session.add(load)
    session.commit()
    session.refresh(load)
    
    # Audit log creation
    audit = LoadAuditEvent(
        load_id=load.id,
        from_state="None",
        to_state="Posted",
        actor_id=current_user.id,
        note="Load created by Broker"
    )
    session.add(audit)
    session.commit()
    
    return get_load_detail(load.id, current_user, session)

@router.get("", response_model=List[LoadDetailResponse])
def list_loads(
    state: Optional[str] = None,
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    carrier_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    query = select(Load)
    
    # Apply organization/shipper scoping checks
    if current_user.org.type == "broker":
        query = query.where(Load.broker_org_id == current_user.org_id)
    elif current_user.org.type == "carrier":
        query = query.where(Load.carrier_org_id == current_user.org_id)
    elif current_user.org.type == "shipper":
        query = query.where(Load.shipper_id == current_user.id)
        
    # Apply filters
    if state:
        query = query.where(Load.state == state)
    if origin:
        query = query.where(Load.origin.contains(origin))
    if destination:
        query = query.where(Load.destination.contains(destination))
    if carrier_id:
        query = query.where(Load.carrier_org_id == carrier_id)
        
    loads = session.exec(query).all()
    
    result = []
    for load in loads:
        # Recompute compliance live at read-time
        sync_load_compliance(load, session)
        result.append(build_load_response(load, session))
        
    return result

@router.get("/{load_id}", response_model=LoadDetailResponse)
def get_load(
    load_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    return get_load_detail(load_id, current_user, session)

@router.post("/{load_id}/assign-carrier", response_model=LoadDetailResponse)
def assign_carrier(
    load_id: int,
    req: CarrierAssignRequest,
    current_user: User = Depends(require_permission("load.assign_carrier")),
    session: Session = Depends(get_session)
):
    load = session.get(Load, load_id)
    if not load:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Load not found"
        )
        
    check_load_access(load, current_user)
    
    # Confirm state allows carrier assignment
    if load.state not in ("Posted", "Carrier Assigned"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign carrier once load progresses past Carrier Assigned state"
        )
        
    # Verify carrier organization exists and is a carrier
    carrier_org = session.get(Org, req.carrier_org_id)
    if not carrier_org or carrier_org.type != "carrier":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Carrier organization selected"
        )
        
    from_state = load.state
    load.carrier_org_id = req.carrier_org_id
    load.state = "Carrier Assigned"
    load.updated_at = datetime.utcnow()
    
    # Perform compliance checks immediately
    load.compliance_flag = verify_carrier_compliance(load, session)
    
    session.add(load)
    
    # Audit log
    audit = LoadAuditEvent(
        load_id=load.id,
        from_state=from_state,
        to_state="Carrier Assigned",
        actor_id=current_user.id,
        note=f"Carrier {carrier_org.name} assigned by Broker. Compliance status flag: {load.compliance_flag}."
    )
    session.add(audit)
    session.commit()
    
    return get_load_detail(load.id, current_user, session)

@router.post("/{load_id}/transition", response_model=LoadDetailResponse)
def transition_load(
    load_id: int,
    req: TransitionRequest,
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
    
    # Verify target state is valid
    if req.to_state not in STATES_ORDER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target state: {req.to_state}"
        )
        
    # Enforce strict forward ordering
    current_idx = STATES_ORDER.index(load.state)
    target_idx = STATES_ORDER.index(req.to_state)
    
    if target_idx != current_idx + 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition: Cannot transition from {load.state} directly to {req.to_state}"
        )
        
    # Enforce permission gates:
    # 1. Rate Confirmed requires rate.confirm
    # 2. Others require load.update_status
    required_permission = "rate.confirm" if req.to_state == "Rate Confirmed" else "load.update_status"
    if not current_user.role or required_permission not in current_user.role.permissions:
        from app.auth import log_denial
        log_denial(current_user.id, current_user.org_id, required_permission, f"POST /api/loads/{load_id}/transition")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: '{required_permission}' is required to transition to {req.to_state}"
        )
        
    # Special conditions:
    # - Transitioning to Rate Confirmed requires a Rate Confirmation
    if req.to_state == "Rate Confirmed":
        latest_conf = session.exec(
            select(RateConfirmation).where(RateConfirmation.load_id == load_id)
        ).first()
        if not latest_conf:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rate confirmation must be created before transitioning to Rate Confirmed state"
            )
            
    # - Transitioning to POD Verified requires a POD uploaded
    if req.to_state == "POD Verified" and not load.pod_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A Proof of Delivery (POD) must be uploaded by the carrier before transitioning to POD Verified"
        )
        
    # Recompute compliance status live right before transition
    load.compliance_flag = verify_carrier_compliance(load, session)
    
    # Enforce compliance gate for all transitions past Carrier Assigned
    # (meaning target state index is higher than Carrier Assigned)
    carrier_assigned_idx = STATES_ORDER.index("Carrier Assigned")
    is_override = False
    
    if target_idx > carrier_assigned_idx and load.compliance_flag:
        # Check if user has override permission
        if not current_user.role or "load.override_compliance_flag" not in current_user.role.permissions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Compliance Gate Active: Assigned carrier is non-compliant. Action blocked."
            )
        is_override = True
        
    from_state = load.state
    load.state = req.to_state
    load.updated_at = datetime.utcnow()
    session.add(load)
    
    # Audit log
    override_note = " [COMPLIANCE OVERRIDE]" if is_override else ""
    user_note = f" - Note: {req.note}" if req.note else ""
    audit_note = f"State transitioned by {current_user.full_name}{override_note}{user_note}"
    
    audit = LoadAuditEvent(
        load_id=load.id,
        from_state=from_state,
        to_state=req.to_state,
        actor_id=current_user.id,
        note=audit_note
    )
    session.add(audit)
    session.commit()
    
    return get_load_detail(load.id, current_user, session)

@router.post("/{load_id}/pod")
def upload_pod(
    load_id: int,
    file_name: str, # For simplicity of demonstration we pass a name, or handle multipart
    current_user: User = Depends(require_permission("pod.upload")),
    session: Session = Depends(get_session)
):
    load = session.get(Load, load_id)
    if not load:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Load not found"
        )
        
    check_load_access(load, current_user)
    
    load.pod_url = file_name
    load.updated_at = datetime.utcnow()
    session.add(load)
    
    # Audit log
    audit = LoadAuditEvent(
        load_id=load.id,
        from_state=load.state,
        to_state=load.state,
        actor_id=current_user.id,
        note=f"POD File uploaded: {file_name}"
    )
    session.add(audit)
    session.commit()
    
    return {"message": "POD uploaded successfully", "pod_url": file_name}

# Helpers
def get_load_detail(load_id: int, user: User, session: Session) -> Load:
    load = session.get(Load, load_id)
    if not load:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Load not found"
        )
    check_load_access(load, user)
    sync_load_compliance(load, session)
    return build_load_response(load, session)

def build_load_response(load: Load, session: Session) -> LoadDetailResponse:
    # Fetch shipper details
    shipper = session.get(User, load.shipper_id)
    shipper_name = shipper.full_name if shipper else "Unknown Shipper"
    
    # Fetch broker details
    broker = session.get(Org, load.broker_org_id)
    broker_name = broker.name if broker else "Unknown Broker"
    
    # Fetch carrier details
    carrier_name = None
    if load.carrier_org_id:
        carrier = session.get(Org, load.carrier_org_id)
        carrier_name = carrier.name if carrier else "Unknown Carrier"
        
    # Fetch latest rate confirmation
    latest_rate = session.exec(
        select(RateConfirmation)
        .where(RateConfirmation.load_id == load.id)
        .order_by(RateConfirmation.version.desc())
    ).first()
    latest_rate_val = latest_rate.base_rate if latest_rate else None
    
    # Fetch audit events
    audits = session.exec(
        select(LoadAuditEvent)
        .where(LoadAuditEvent.load_id == load.id)
        .order_by(LoadAuditEvent.timestamp.asc())
    ).all()
    
    audit_responses = []
    for audit in audits:
        actor = session.get(User, audit.actor_id)
        actor_name = actor.full_name if actor else "System"
        audit_responses.append(
            AuditEventResponse(
                id=audit.id,
                load_id=audit.load_id,
                from_state=audit.from_state,
                to_state=audit.to_state,
                actor_id=audit.actor_id,
                actor_name=actor_name,
                timestamp=audit.timestamp,
                note=audit.note
            )
        )
        
    return LoadDetailResponse(
        id=load.id,
        shipper_id=load.shipper_id,
        shipper_name=shipper_name,
        broker_org_id=load.broker_org_id,
        broker_name=broker_name,
        carrier_org_id=load.carrier_org_id,
        carrier_name=carrier_name,
        state=load.state,
        compliance_flag=load.compliance_flag,
        origin=load.origin,
        destination=load.destination,
        commodity=load.commodity,
        equipment_type=load.equipment_type,
        pod_url=load.pod_url,
        created_at=load.created_at,
        updated_at=load.updated_at,
        audit_events=audit_responses,
        latest_rate_confirmation=latest_rate_val
    )
