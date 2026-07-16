from datetime import datetime, date
from typing import List, Optional, Dict, Any
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, JSON

class Org(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: str  # broker | carrier | shipper
    
    users: List["User"] = Relationship(back_populates="org")

class Role(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="org.id")
    name: str
    permissions: List[str] = Field(default=[], sa_column=Column(JSON))
    
    users: List["User"] = Relationship(back_populates="role")

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="org.id")
    role_id: Optional[int] = Field(default=None, foreign_key="role.id", nullable=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    full_name: str
    
    org: Org = Relationship(back_populates="users")
    role: Optional[Role] = Relationship(back_populates="users")

class CarrierComplianceRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    carrier_org_id: int = Field(foreign_key="org.id")
    insurance_expiry: date
    authority_status: str  # active | suspended | revoked
    approved_equipment: List[str] = Field(default=[], sa_column=Column(JSON))
    approved_commodities: List[str] = Field(default=[], sa_column=Column(JSON))

class Load(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    shipper_id: int = Field(foreign_key="user.id")
    broker_org_id: int = Field(foreign_key="org.id")
    carrier_org_id: Optional[int] = Field(default=None, foreign_key="org.id", nullable=True)
    state: str  # Posted | Carrier Assigned | Rate Confirmed | Dispatched | In Transit | Delivered | POD Verified | Invoiced/Closed
    compliance_flag: bool = Field(default=False)
    origin: str
    destination: str
    commodity: str
    equipment_type: str
    pod_url: Optional[str] = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class LoadAuditEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    load_id: int = Field(foreign_key="load.id")
    from_state: str
    to_state: str
    actor_id: int = Field(foreign_key="user.id")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    note: Optional[str] = Field(default=None, nullable=True)

class RateConfirmation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    load_id: int = Field(foreign_key="load.id")
    version: int
    base_rate: float
    accessorials: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    confirmed_at: datetime = Field(default_factory=datetime.utcnow)
    confirmed_by: int = Field(foreign_key="user.id")
