from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select
from typing import List

from app.database import get_session
from app.models import Role, User
from app.auth import require_permission

router = APIRouter(prefix="/roles", tags=["roles"])

PERMISSION_CATALOG = {
    "load.create",
    "load.assign_carrier",
    "load.override_compliance_flag",
    "rate.confirm",
    "load.update_status",
    "staff.manage",
    "pod.upload"
}

class RoleCreateRequest(BaseModel):
    name: str
    permissions: List[str]

    @field_validator('permissions')
    @classmethod
    def validate_permissions(cls, v):
        invalid_permissions = [p for p in v if p not in PERMISSION_CATALOG]
        if invalid_permissions:
            raise ValueError(f"Invalid permissions: {', '.join(invalid_permissions)}")
        return v

class RoleUpdateRequest(BaseModel):
    permissions: List[str]

    @field_validator('permissions')
    @classmethod
    def validate_permissions(cls, v):
        invalid_permissions = [p for p in v if p not in PERMISSION_CATALOG]
        if invalid_permissions:
            raise ValueError(f"Invalid permissions: {', '.join(invalid_permissions)}")
        return v

@router.get("", response_model=List[Role])
def list_roles(
    current_user: User = Depends(require_permission("staff.manage")),
    session: Session = Depends(get_session)
):
    roles = session.exec(select(Role).where(Role.org_id == current_user.org_id)).all()
    return roles

@router.post("", response_model=Role, status_code=status.HTTP_201_CREATED)
def create_role(
    req: RoleCreateRequest,
    current_user: User = Depends(require_permission("staff.manage")),
    session: Session = Depends(get_session)
):
    role = Role(
        org_id=current_user.org_id,
        name=req.name,
        permissions=req.permissions
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    return role

@router.patch("/{role_id}", response_model=Role)
def update_role(
    role_id: int,
    req: RoleUpdateRequest,
    current_user: User = Depends(require_permission("staff.manage")),
    session: Session = Depends(get_session)
):
    role = session.get(Role, role_id)
    if not role or role.org_id != current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found in your organization"
        )
    
    role.permissions = req.permissions
    session.add(role)
    session.commit()
    session.refresh(role)
    return role
