import os
import sys
from datetime import date, datetime, timedelta

# Adjust python path to find app module
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

from sqlmodel import Session, SQLModel
from app.database import engine, create_db_and_tables
from app.models import Org, User, Role, CarrierComplianceRecord, Load, LoadAuditEvent, RateConfirmation
from app.auth import get_password_hash

def seed_database():
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "loadflow.db")
    if os.path.exists(db_path):
        print(f"Removing existing database at {db_path}...")
        try:
            os.remove(db_path)
        except PermissionError:
            print("Warning: Could not remove database file, it might be in use. Clearing tables instead.")
            
    print("Recreating database tables...")
    # Drop all existing tables to allow clean rebuild when database file is locked
    SQLModel.metadata.drop_all(engine)
    create_db_and_tables()
    
    with Session(engine) as session:
        print("Seeding organizations...")
        broker_org = Org(name="Apex Logistics Brokerage", type="broker")
        carrier_compliant = Org(name="Swift Transport (Compliant Carrier)", type="carrier")
        carrier_noncompliant = Org(name="Lapsed Logistics (Non-Compliant Carrier)", type="carrier")
        shipper_org_1 = Org(name="Global Food Distributors", type="shipper")
        shipper_org_2 = Org(name="National Steel Corp", type="shipper")
        
        session.add_all([broker_org, carrier_compliant, carrier_noncompliant, shipper_org_1, shipper_org_2])
        session.commit()
        for org in [broker_org, carrier_compliant, carrier_noncompliant, shipper_org_1, shipper_org_2]:
            session.refresh(org)
            
        print("Seeding roles...")
        # All 7 permissions:
        # load.create, load.assign_carrier, load.override_compliance_flag, rate.confirm, load.update_status, staff.manage, pod.upload
        all_perms = [
            "load.create",
            "load.assign_carrier",
            "load.override_compliance_flag",
            "rate.confirm",
            "load.update_status",
            "staff.manage",
            "pod.upload"
        ]
        
        broker_admin_role = Role(
            org_id=broker_org.id,
            name="Admin",
            permissions=all_perms
        )
        carrier_admin_role = Role(
            org_id=carrier_compliant.id,
            name="Admin",
            permissions=all_perms
        )
        carrier_noncompliant_admin_role = Role(
            org_id=carrier_noncompliant.id,
            name="Admin",
            permissions=all_perms
        )
        
        # Example non-admin roles:
        broker_dispatcher = Role(
            org_id=broker_org.id,
            name="Dispatcher",
            permissions=["load.assign_carrier", "rate.confirm"]
        )
        broker_ops_lead = Role(
            org_id=broker_org.id,
            name="Ops Lead",
            permissions=[
                "load.create", 
                "load.assign_carrier", 
                "rate.confirm", 
                "load.update_status", 
                "staff.manage", 
                "load.override_compliance_flag"
            ]
        )
        carrier_driver = Role(
            org_id=carrier_compliant.id,
            name="Driver",
            permissions=["load.update_status", "pod.upload"]
        )
        carrier_dispatch = Role(
            org_id=carrier_compliant.id,
            name="Carrier Dispatch",
            permissions=["load.update_status"]
        )
        
        session.add_all([
            broker_admin_role, carrier_admin_role, carrier_noncompliant_admin_role,
            broker_dispatcher, broker_ops_lead, carrier_driver, carrier_dispatch
        ])
        session.commit()
        for r in [broker_admin_role, carrier_admin_role, carrier_noncompliant_admin_role, broker_dispatcher, broker_ops_lead, carrier_driver, carrier_dispatch]:
            session.refresh(r)
            
        print("Seeding users...")
        pwd_hash = get_password_hash("password123")
        
        # Admin users
        b_admin = User(
            org_id=broker_org.id,
            role_id=broker_admin_role.id,
            email="broker.admin@loadflow.com",
            password_hash=pwd_hash,
            full_name="Alice Broker (Admin)"
        )
        c_admin = User(
            org_id=carrier_compliant.id,
            role_id=carrier_admin_role.id,
            email="carrier.admin@loadflow.com",
            password_hash=pwd_hash,
            full_name="Bob Carrier (Admin)"
        )
        c_bad_admin = User(
            org_id=carrier_noncompliant.id,
            role_id=carrier_noncompliant_admin_role.id,
            email="lapsed.admin@loadflow.com",
            password_hash=pwd_hash,
            full_name="Charlie Lapsed (Admin)"
        )
        
        # Staff users
        b_dispatcher = User(
            org_id=broker_org.id,
            role_id=broker_dispatcher.id,
            email="broker.dispatcher@loadflow.com",
            password_hash=pwd_hash,
            full_name="Dennis Dispatcher"
        )
        c_driver = User(
            org_id=carrier_compliant.id,
            role_id=carrier_driver.id,
            email="carrier.driver@loadflow.com",
            password_hash=pwd_hash,
            full_name="Dave Driver"
        )
        
        # Shipper users (Null roles)
        s_user1 = User(
            org_id=shipper_org_1.id,
            role_id=None,
            email="shipper.global@loadflow.com",
            password_hash=pwd_hash,
            full_name="Gary Shipper (Global Food)"
        )
        s_user2 = User(
            org_id=shipper_org_2.id,
            role_id=None,
            email="shipper.steel@loadflow.com",
            password_hash=pwd_hash,
            full_name="Sarah Shipper (National Steel)"
        )
        
        session.add_all([b_admin, c_admin, c_bad_admin, b_dispatcher, c_driver, s_user1, s_user2])
        session.commit()
        for u in [b_admin, c_admin, c_bad_admin, b_dispatcher, c_driver, s_user1, s_user2]:
            session.refresh(u)
            
        print("Seeding compliance records...")
        # Compliant carrier: Active authority, valid insurance, approved equipment/commodities
        compliant_compliance = CarrierComplianceRecord(
            carrier_org_id=carrier_compliant.id,
            insurance_expiry=date.today() + timedelta(days=120),  # Valid
            authority_status="active",
            approved_equipment=["Reefer", "Flatbed", "Dry Van"],
            approved_commodities=["Produce", "Steel", "General Freight"]
        )
        # Non-compliant carrier: Expired insurance & revoked authority
        noncompliant_compliance = CarrierComplianceRecord(
            carrier_org_id=carrier_noncompliant.id,
            insurance_expiry=date.today() - timedelta(days=10),   # Expired 10 days ago
            authority_status="suspended",
            approved_equipment=["Flatbed"],
            approved_commodities=["Steel"]
        )
        
        session.add_all([compliant_compliance, noncompliant_compliance])
        session.commit()
        
        print("Seeding loads...")
        # Load 1: Posted
        load1 = Load(
            shipper_id=s_user1.id,
            broker_org_id=broker_org.id,
            state="Posted",
            compliance_flag=False,
            origin="Salinas, CA",
            destination="Chicago, IL",
            commodity="Produce",
            equipment_type="Reefer"
        )
        # Load 2: Carrier Assigned (but Carrier is compliant)
        load2 = Load(
            shipper_id=s_user2.id,
            broker_org_id=broker_org.id,
            carrier_org_id=carrier_compliant.id,
            state="Carrier Assigned",
            compliance_flag=False, # Compliant
            origin="Gary, IN",
            destination="Houston, TX",
            commodity="Steel",
            equipment_type="Flatbed"
        )
        # Load 3: Carrier Assigned (Carrier is non-compliant)
        load3 = Load(
            shipper_id=s_user1.id,
            broker_org_id=broker_org.id,
            carrier_org_id=carrier_noncompliant.id,
            state="Carrier Assigned",
            compliance_flag=True, # Non-compliant due to expired insurance + suspended status + equipment mismatch (Produce vs Steel)
            origin="Fresno, CA",
            destination="Seattle, WA",
            commodity="Produce",
            equipment_type="Reefer"
        )
        
        session.add_all([load1, load2, load3])
        session.commit()
        for ld in [load1, load2, load3]:
            session.refresh(ld)
            
        print("Seeding load audits & rate confirmations...")
        # Add rate confirmation for load 2
        rate2 = RateConfirmation(
            load_id=load2.id,
            version=1,
            base_rate=2400.0,
            accessorials=[{"description": "Fuel Surcharge", "amount": 350.0}],
            confirmed_by=b_admin.id
        )
        session.add(rate2)
        
        # Transition Load 2 to Rate Confirmed
        load2.state = "Rate Confirmed"
        session.add(load2)
        
        # Audit trails
        audit_l1 = LoadAuditEvent(
            load_id=load1.id, from_state="None", to_state="Posted", actor_id=b_admin.id,
            note="Load posted to system"
        )
        audit_l2_posted = LoadAuditEvent(
            load_id=load2.id, from_state="None", to_state="Posted", actor_id=b_admin.id,
            note="Load posted to system"
        )
        audit_l2_assigned = LoadAuditEvent(
            load_id=load2.id, from_state="Posted", to_state="Carrier Assigned", actor_id=b_admin.id,
            note=f"Assigned carrier {carrier_compliant.name}"
        )
        audit_l2_confirmed = LoadAuditEvent(
            load_id=load2.id, from_state="Carrier Assigned", to_state="Rate Confirmed", actor_id=b_admin.id,
            note="Rate confirmation version 1 appended and confirmed"
        )
        
        audit_l3_posted = LoadAuditEvent(
            load_id=load3.id, from_state="None", to_state="Posted", actor_id=b_dispatcher.id,
            note="Load posted to system"
        )
        audit_l3_assigned = LoadAuditEvent(
            load_id=load3.id, from_state="Posted", to_state="Carrier Assigned", actor_id=b_dispatcher.id,
            note=f"Assigned carrier {carrier_noncompliant.name}. COMPLIANCE FLAG TRIGGERED (non-compliant)."
        )
        
        session.add_all([audit_l1, audit_l2_posted, audit_l2_assigned, audit_l2_confirmed, audit_l3_posted, audit_l3_assigned])
        session.commit()
        
    print("\n" + "="*50)
    print("DATABASE SEEDING COMPLETED SUCCESSFULLY!")
    print("="*50)
    print("Use the following credentials to login during testing (Password for all: password123):")
    print(f"1. Broker Admin:       email: broker.admin@loadflow.com")
    print(f"2. Broker Dispatcher:  email: broker.dispatcher@loadflow.com")
    print(f"3. Carrier Admin:      email: carrier.admin@loadflow.com")
    print(f"4. Carrier Driver:     email: carrier.driver@loadflow.com")
    print(f"5. Non-Compl. Carrier: email: lapsed.admin@loadflow.com")
    print(f"6. Shipper 1 (Global): email: shipper.global@loadflow.com")
    print(f"7. Shipper 2 (Steel):  email: shipper.steel@loadflow.com")
    print("="*50 + "\n")

if __name__ == "__main__":
    seed_database()
