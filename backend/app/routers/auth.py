from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select
from typing import Optional

from app.database import get_session
from app.models import User, Org, Role
from app.auth import verify_password, get_password_hash, create_access_token, require_permission, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    email: str
    full_name: str
    org_id: int
    org_type: str
    role_id: Optional[int] = None
    role_name: Optional[str] = None

class StaffCreateRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role_id: int  # Must be a role within the creator's organization

@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == req.email)).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    org = session.get(Org, user.org_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User organization not found"
        )
        
    token_payload = {
        "user_id": user.id,
        "org_id": user.org_id,
        "org_type": org.type,
        "role_id": user.role_id
    }
    
    access_token = create_access_token(data=token_payload)
    role_name = user.role.name if user.role else None
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        org_id=user.org_id,
        org_type=org.type,
        role_id=user.role_id,
        role_name=role_name
    )

@router.post("/staff", status_code=status.HTTP_201_CREATED)
def create_staff(
    req: StaffCreateRequest,
    current_user: User = Depends(require_permission("staff.manage")),
    session: Session = Depends(get_session)
):
    # Verify that the target role exists and belongs to the admin's organization
    role = session.get(Role, req.role_id)
    if not role or role.org_id != current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role selected for organization"
        )
        
    # Check if the email already exists
    existing_user = session.exec(select(User).where(User.email == req.email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists"
        )
        
    # Create the user
    new_user = User(
        email=req.email,
        password_hash=get_password_hash(req.password),
        full_name=req.full_name,
        org_id=current_user.org_id,
        role_id=req.role_id
    )
    
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return {"message": "Staff member created successfully", "user_id": new_user.id}

class ShipperUserResponse(BaseModel):
    id: int
    full_name: str
    email: str

@router.get("/shippers", response_model=list[ShipperUserResponse])
def list_shippers(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    shippers = session.exec(
        select(User).join(Org, User.org_id == Org.id).where(Org.type == "shipper")
    ).all()
    return shippers
