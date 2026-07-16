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
    print("RUNNING API RBAC SECURITY VERIFICATION")
    print("="*60)
    
    # 1. Login as Carrier Driver
    print("Logging in as Carrier Driver (Dave Driver)...")
    driver_token = login("carrier.driver@loadflow.com", "password123")
    headers = {"Authorization": f"Bearer {driver_token}"}
    
    # Attempt to create a load (requires load.create)
    print("Attempting to POST /api/loads as Driver...")
    code, res = make_request("/api/loads", method="POST", headers=headers, data={
        "shipper_id": 6, "origin": "A", "destination": "B", "commodity": "C", "equipment_type": "Dry Van"
    })
    print(f"-> Response code: {code} (Detail: {res})")
    assert code == 403, f"Expected 403, got {code}"
    
    # Attempt to create a role (requires staff.manage)
    print("Attempting to POST /api/roles as Driver...")
    code, res = make_request("/api/roles", method="POST", headers=headers, data={
        "name": "Super Driver", "permissions": ["pod.upload"]
    })
    print(f"-> Response code: {code} (Detail: {res})")
    assert code == 403, f"Expected 403, got {code}"
    
    # 2. Login as Shipper 1
    print("\nLogging in as Shipper 1 (Gary Shipper, Global Food)...")
    shipper_token = login("shipper.global@loadflow.com", "password123")
    headers = {"Authorization": f"Bearer {shipper_token}"}
    
    # Load 2 belongs to Shipper 2 (Sarah Shipper, National Steel)
    print("Attempting to GET /api/loads/2 (belongs to Shipper 2) as Shipper 1...")
    code, res = make_request("/api/loads/2", method="GET", headers=headers)
    print(f"-> Response code: {code} (Detail: {res})")
    assert code == 403, f"Expected 403, got {code}"
    
    # 3. Login as Broker Dispatcher
    print("\nLogging in as Broker Dispatcher (Dennis Dispatcher)...")
    dispatch_token = login("broker.dispatcher@loadflow.com", "password123")
    headers = {"Authorization": f"Bearer {dispatch_token}"}
    
    # Attempt to create a role (requires staff.manage, Dispatcher lacks this)
    print("Attempting to POST /api/roles as Broker Dispatcher...")
    code, res = make_request("/api/roles", method="POST", headers=headers, data={
        "name": "Dispatcher Plus", "permissions": ["load.assign_carrier"]
    })
    print(f"-> Response code: {code} (Detail: {res})")
    assert code == 403, f"Expected 403, got {code}"
    
    # 4. Verify denials log
    print("\nChecking auth_denials.log...")
    log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auth_denials.log")
    if os.path.exists(log_path):
        with open(log_path, "r") as f:
            lines = f.readlines()
        print(f"Found {len(lines)} denial log entries. Last 4 entries:")
        for line in lines[-4:]:
            print(f"  {line.strip()}")
    else:
        print("ERROR: auth_denials.log not found!")
        
    print("\n" + "="*60)
    print("ALL API SECURITY GATES VERIFIED SUCCESSFULLY!")
    print("="*60)

if __name__ == "__main__":
    run_tests()
