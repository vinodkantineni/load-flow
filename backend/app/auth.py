import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session
from dotenv import load_dotenv

from app.database import get_session
from app.models import User, Role, Org

# Load .env variables
load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET", "super_secret_jwt_key_change_in_production_12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

# Path to log authorization denials
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DENIALS_LOG_PATH = os.path.join(BASE_DIR, "auth_denials.log")

security = HTTPBearer()

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: Session = Depends(get_session)
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing user ID",
        )
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user

def log_denial(user_id: int, org_id: int, attempted_permission: str, endpoint: str):
    timestamp = datetime.now().isoformat()
    log_line = f"[{timestamp}] User {user_id} (Org {org_id}) attempted '{attempted_permission}' on '{endpoint}' -> DENIED\n"
    try:
        with open(DENIALS_LOG_PATH, "a") as f:
            f.write(log_line)
    except Exception as e:
        print(f"Failed to log auth denial: {e}")

def require_permission(permission: str):
    def dependency(
        request: Request,
        user: User = Depends(get_current_user)
    ) -> User:
        endpoint = f"{request.method} {request.url.path}"
        
        # Check permissions: Shippers (no role_id/role) or users lacking permission get 403
        if not user.role or permission not in user.role.permissions:
            log_denial(user.id, user.org_id, permission, endpoint)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: '{permission}' is required"
            )
        return user
    return dependency

def check_load_access(load, user: User):
    """
    Checks that the resource being accessed belongs to the caller's org_id or user.
    - Broker staff: load.broker_org_id == user.org_id
    - Carrier staff: load.carrier_org_id == user.org_id
    - Shipper: load.shipper_id == user.id
    """
    if user.org.type == "broker":
        if load.broker_org_id != user.org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: outside organization scope"
            )
    elif user.org.type == "carrier":
        if load.carrier_org_id != user.org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: outside organization scope"
            )
    elif user.org.type == "shipper":
        if load.shipper_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: you do not own this load"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: unknown organization type"
        )
