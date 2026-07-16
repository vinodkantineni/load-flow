import urllib.request
import json
import os

BASE_URL = "http://127.0.0.1:8000"

def make_request(url, method="GET", headers=None, data=None):
    if headers is None:
        headers = {}
    
    req_data = None
    if data is not None:
        req_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
        
    req = urllib.request.Request(f"{BASE_URL}{url}", headers=headers, method=method, data=req_data)
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode("utf-8"))
        except Exception:
            err_body = e.reason
        return e.code, err_body
    except Exception as e:
        return 0, str(e)

def login(email, password):
    code, res = make_request("/api/auth/login", method="POST", data={"email": email, "password": password})
    if code == 200:
        return res["access_token"]
    raise Exception(f"Login failed: {res}")

def run_tests():
    print("="*60)
    print("RUNNING API COMPLIANCE GATE VERIFICATION")
    print("="*60)
    
    # 1. Login as Broker Dispatcher (lacks override permission)
    print("Logging in as Broker Dispatcher (Dennis Dispatcher)...")
    dispatcher_token = login("broker.dispatcher@loadflow.com", "password123")
    disp_headers = {"Authorization": f"Bearer {dispatcher_token}"}
    
    # We will use Load 1 which is in "Posted" state
    print("Assigning Non-Compliant Carrier (Lapsed Logistics, Org 3) to Load 1 as Dispatcher...")
    code, load = make_request("/api/loads/1/assign-carrier", method="POST", headers=disp_headers, data={
        "carrier_org_id": 3
    })
    print(f"-> Response code: {code}")
    assert code == 200, f"Expected 200, got {code}"
    
    compliance_flag = load.get("compliance_flag")
    print(f"-> Assigned carrier. Compliance Flag state: {compliance_flag}")
    assert compliance_flag is True, "Expected compliance_flag to be True"
    
    # We must create a Rate Confirmation before transitioning to Rate Confirmed
    print("Creating Rate Confirmation for Load 1 as Dispatcher...")
    code, rate_res = make_request("/api/loads/1/rate-confirmation", method="POST", headers=disp_headers, data={
        "base_rate": 2500.0,
        "accessorials": [{"description": "Tarping Fee", "amount": 100.0}]
    })
    print(f"-> Response code: {code}")
    assert code == 201, f"Expected 201, got {code}"
    
    # Now attempt to transition Load 1 to "Rate Confirmed"
    print("Attempting to transition Load 1 past Carrier Assigned to 'Rate Confirmed' as Dispatcher...")
    code, res = make_request("/api/loads/1/transition", method="POST", headers=disp_headers, data={
        "to_state": "Rate Confirmed",
        "note": "Dispatcher attempting transition"
    })
    print(f"-> Response code: {code} (Detail: {res})")
    assert code == 400, f"Expected 400 block, got {code}"
    assert "Compliance Gate Active" in res.get("detail", ""), f"Expected compliance gate message, got: {res}"
    print("SUCCESS: Compliance gate correctly blocked the transition for the Dispatcher.")
    
    # 2. Login as Broker Admin (has override permission)
    print("\nLogging in as Broker Admin (Alice Broker)...")
    admin_token = login("broker.admin@loadflow.com", "password123")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Attempt same transition as Broker Admin (should succeed with override)
    print("Attempting to transition Load 1 past Carrier Assigned to 'Rate Confirmed' as Admin...")
    code, res = make_request("/api/loads/1/transition", method="POST", headers=admin_headers, data={
        "to_state": "Rate Confirmed",
        "note": "Admin override transition"
    })
    print(f"-> Response code: {code}")
    assert code == 200, f"Expected 200, got {code}"
    print(f"-> Transition succeeded. Load state is now: {res.get('state')}")
    assert res.get("state") == "Rate Confirmed", "Expected state to transition to Rate Confirmed"
    
    # Check that audit log has the override note
    print("Verifying audit events for Load 1...")
    audits = res.get("audit_events", [])
    last_audit = audits[-1] if audits else {}
    print(f"-> Last Audit Event Note: {last_audit.get('note')}")
    assert "COMPLIANCE OVERRIDE" in last_audit.get("note", ""), "Expected audit log to document the COMPLIANCE OVERRIDE"
    print("SUCCESS: Audit log correctly records the compliance override.")
    
    print("\n" + "="*60)
    print("COMPLIANCE GATE VERIFICATION SUCCESSFUL!")
    print("="*60)

if __name__ == "__main__":
    run_tests()
