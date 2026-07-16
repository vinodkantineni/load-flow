import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const STATUS_STEPS = [
  "Posted",
  "Carrier Assigned",
  "Rate Confirmed",
  "Dispatched",
  "In Transit",
  "Delivered",
  "POD Verified",
  "Invoiced/Closed"
];

export default function CarrierDashboard() {
  const { apiFetch, user, logout } = useAuth();
  const [loads, setLoads] = useState([]);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Compliance States
  const [complianceRecord, setComplianceRecord] = useState(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [authorityStatus, setAuthorityStatus] = useState('active');
  const [approvedEquipment, setApprovedEquipment] = useState('');
  const [approvedCommodities, setApprovedCommodities] = useState('');

  // POD Form
  const [podFile, setPodFile] = useState('');
  const [transitionNote, setTransitionNote] = useState('');

  const isCarrierAdmin = user?.role_name === 'Admin' || (user?.role_id && user?.role_name === 'Admin'); // We check if user has admin privileges or has staff.manage
  
  // To be safe, we check if they have staff.manage in permissions or role_name is Admin
  const hasStaffManage = user?.role_name === 'Admin' || (user?.role_id && user?.role_name === 'Admin'); 

  const fetchLoads = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/loads');
      if (res.ok) {
        const data = await res.json();
        setLoads(data);
        if (selectedLoad) {
          const updated = data.find(l => l.id === selectedLoad.id);
          if (updated) setSelectedLoad(updated);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompliance = async () => {
    if (!user?.org_id) return;
    setComplianceLoading(true);
    try {
      const res = await apiFetch(`/api/compliance/${user.org_id}`);
      if (res.ok) {
        const data = await res.json();
        setComplianceRecord(data);
        setInsuranceExpiry(data.insurance_expiry);
        setAuthorityStatus(data.authority_status);
        setApprovedEquipment(data.approved_equipment.join(', '));
        setApprovedCommodities(data.approved_commodities.join(', '));
      }
    } catch (err) {
      console.error("Compliance record not found or error loading it.");
    } finally {
      setComplianceLoading(false);
    }
  };

  useEffect(() => {
    fetchLoads();
    fetchCompliance();
  }, []);

  const handleComplianceSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    const eqList = approvedEquipment.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const commList = approvedCommodities.split(',').map(s => s.trim()).filter(s => s.length > 0);

    try {
      const res = await apiFetch(`/api/compliance/${user.org_id}`, {
        method: 'PATCH',
        body: {
          insurance_expiry: insuranceExpiry,
          authority_status: authorityStatus,
          approved_equipment: eqList,
          approved_commodities: commList
        }
      });

      if (res.ok) {
        setSuccess('Compliance record updated successfully.');
        const data = await res.json();
        setComplianceRecord(data);
        fetchLoads(); // Re-fetch loads in case compliance flags changed
      } else {
        const err = await res.json();
        setError(err.detail || 'Could not update compliance record.');
      }
    } catch (err) {
      setError('Failed to save compliance details.');
    }
  };

  const handleTransition = async (toState) => {
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(`/api/loads/${selectedLoad.id}/transition`, {
        method: 'POST',
        body: { to_state: toState, note: transitionNote }
      });

      if (res.ok) {
        setSuccess(`Successfully transitioned load status to ${toState}`);
        setTransitionNote('');
        fetchLoads();
      } else {
        const err = await res.json();
        setError(err.detail || 'State transition failed. Make sure your carrier compliance record is active and insurance is up to date.');
      }
    } catch (err) {
      setError('Network or permission error updating state.');
    }
  };

  const handlePodUploadSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!podFile.trim()) {
      setError('Please provide a file name or description to upload.');
      return;
    }

    try {
      const res = await apiFetch(`/api/loads/${selectedLoad.id}/pod?file_name=${encodeURIComponent(podFile)}`, {
        method: 'POST'
      });

      if (res.ok) {
        setSuccess('Proof of Delivery (POD) document uploaded successfully.');
        setPodFile('');
        fetchLoads();
      } else {
        const err = await res.json();
        setError(err.detail || 'Could not upload POD.');
      }
    } catch (err) {
      setError('POD Upload failed.');
    }
  };

  const getStepIndex = (currentState) => {
    return STATUS_STEPS.indexOf(currentState);
  };

  const renderTransitionControls = () => {
    if (!selectedLoad) return null;
    const currentIdx = getStepIndex(selectedLoad.state);
    
    if (selectedLoad.state === 'Posted') {
      return <p className="text-xs text-dark-textMuted">Waiting for Broker to assign a carrier.</p>;
    }

    if (selectedLoad.state === 'Carrier Assigned') {
      return (
        <div className="space-y-2">
          <p className="text-xs text-accent-amber font-semibold">Status: Awaiting Rate Confirmation</p>
          <p className="text-[11px] text-dark-textMuted">The rate must be confirmed by the Broker before dispatching.</p>
        </div>
      );
    }

    if (selectedLoad.state === 'Rate Confirmed') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Operational Dispatch</h4>
          <p className="text-xs text-dark-textMuted">Mark this shipment as dispatched to begin loading.</p>
          <div className="flex space-x-2">
            <input 
              type="text" 
              value={transitionNote}
              onChange={(e) => setTransitionNote(e.target.value)}
              placeholder="Dispatcher notes (optional)..."
              className="flex-1 px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border focus:outline-none"
            />
            <button
              onClick={() => handleTransition('Dispatched')}
              className="px-4 py-1.5 bg-primary-600 hover:bg-primary-500 text-white font-semibold text-xs rounded transition-colors"
            >
              Dispatch Load
            </button>
          </div>
        </div>
      );
    }

    if (selectedLoad.state === 'Dispatched') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Start Transit</h4>
          <p className="text-xs text-dark-textMuted">Confirm that the truck has departed the origin facility and is now in transit.</p>
          <div className="flex space-x-2">
            <input 
              type="text" 
              value={transitionNote}
              onChange={(e) => setTransitionNote(e.target.value)}
              placeholder="Transit notes..."
              className="flex-1 px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border focus:outline-none"
            />
            <button
              onClick={() => handleTransition('In Transit')}
              className="px-4 py-1.5 bg-accent-blue hover:bg-accent-blue/80 text-white font-semibold text-xs rounded transition-colors"
            >
              Start Transit
            </button>
          </div>
        </div>
      );
    }

    if (selectedLoad.state === 'In Transit') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Confirm Delivery</h4>
          <p className="text-xs text-dark-textMuted">Mark the shipment as delivered once the truck has arrived and finished unloading.</p>
          <div className="flex space-x-2">
            <input 
              type="text" 
              value={transitionNote}
              onChange={(e) => setTransitionNote(e.target.value)}
              placeholder="Delivery notes..."
              className="flex-1 px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border focus:outline-none"
            />
            <button
              onClick={() => handleTransition('Delivered')}
              className="px-4 py-1.5 bg-accent-green hover:bg-accent-green/80 text-white font-semibold text-xs rounded transition-colors"
            >
              Mark Delivered
            </button>
          </div>
        </div>
      );
    }

    if (selectedLoad.state === 'Delivered') {
      return (
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Upload Proof of Delivery (POD)</h4>
          <p className="text-xs text-dark-textMuted">
            To progress to POD Verified, you must upload the signed paper Bill of Lading / Proof of Delivery.
          </p>
          
          <form onSubmit={handlePodUploadSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={podFile}
              onChange={(e) => setPodFile(e.target.value)}
              placeholder="Enter POD Document ID / Filename (e.g. bol_992.pdf)..."
              className="flex-1 px-3 py-2 text-xs rounded bg-dark-bg/60 border border-dark-border focus:outline-none"
              required
            />
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded transition-colors"
            >
              Upload Document
            </button>
          </form>
        </div>
      );
    }

    if (selectedLoad.state === 'POD Verified') {
      return (
        <div className="space-y-2">
          <p className="text-xs text-accent-green font-semibold">POD Uploaded & Verified: {selectedLoad.pod_url}</p>
          <p className="text-[11px] text-dark-textMuted">Waiting for Broker to process invoicing and close the load file.</p>
        </div>
      );
    }

    if (selectedLoad.state === 'Invoiced/Closed') {
      return (
        <p className="text-xs text-dark-textMuted">This shipment file has been invoiced and closed.</p>
      );
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      {/* Header */}
      <header className="border-b border-dark-border bg-dark-card/50 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-bold tracking-wider text-emerald-400">LoadFlow</span>
            <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-semibold uppercase">
              Carrier Dispatch
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-semibold text-white">{user?.full_name}</div>
              <div className="text-[10px] text-dark-textMuted">{user?.role_name || 'Carrier Partner'}</div>
            </div>
            <button 
              onClick={logout}
              className="px-3.5 py-1.5 bg-dark-border hover:bg-dark-border/80 border border-dark-border rounded text-xs text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Messages */}
        {(error || success) && (
          <div className="mb-6">
            {error && (
              <div className="bg-accent-red/10 border border-accent-red/20 text-accent-red px-4 py-3 rounded-lg text-sm flex items-center space-x-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="bg-accent-green/10 border border-accent-green/20 text-accent-green px-4 py-3 rounded-lg text-sm flex items-center space-x-2">
                <span>✅</span>
                <span>{success}</span>
              </div>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left Side: Loads list */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Compliance Box for Admins */}
            {isCarrierAdmin && (
              <div className="glassmorphism rounded-xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Carrier Compliance Record</h3>
                
                {complianceLoading ? (
                  <p className="text-xs text-dark-textMuted">Loading compliance profile...</p>
                ) : (
                  <form onSubmit={handleComplianceSubmit} className="space-y-4 text-left">
                    <div>
                      <label className="block text-[10px] text-dark-textMuted uppercase tracking-wider mb-1">Insurance Expiry Date</label>
                      <input
                        type="date"
                        value={insuranceExpiry}
                        onChange={(e) => setInsuranceExpiry(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[10px] text-dark-textMuted uppercase tracking-wider mb-1">DOT Authority Status</label>
                      <select
                        value={authorityStatus}
                        onChange={(e) => setAuthorityStatus(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="revoked">Revoked</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-dark-textMuted uppercase tracking-wider mb-1">Approved Equipment (Comma Separated)</label>
                      <input
                        type="text"
                        value={approvedEquipment}
                        onChange={(e) => setApprovedEquipment(e.target.value)}
                        placeholder="Reefer, Flatbed, Dry Van"
                        className="w-full px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-dark-textMuted uppercase tracking-wider mb-1">Approved Commodities (Comma Separated)</label>
                      <input
                        type="text"
                        value={approvedCommodities}
                        onChange={(e) => setApprovedCommodities(e.target.value)}
                        placeholder="Produce, Steel, General Freight"
                        className="w-full px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded transition-colors"
                    >
                      Update Compliance Profile
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Compliance Badge for general view */}
            {!isCarrierAdmin && complianceRecord && (
              <div className="glassmorphism rounded-xl p-4 flex items-center justify-between border-l-4 border-l-emerald-500">
                <div>
                  <h4 className="text-xs font-bold text-white">Compliance Status</h4>
                  <p className="text-[10px] text-dark-textMuted mt-0.5">Insurance expires: {complianceRecord.insurance_expiry}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  complianceRecord.authority_status === 'active' && new Date(complianceRecord.insurance_expiry) >= new Date()
                    ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
                    : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
                }`}>
                  {complianceRecord.authority_status === 'active' && new Date(complianceRecord.insurance_expiry) >= new Date() ? 'Compliant' : 'Warning'}
                </span>
              </div>
            )}

            {/* Loads Board */}
            <div className="glassmorphism rounded-xl p-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Assigned Shipments</h3>
              
              {loading && loads.length === 0 ? (
                <p className="text-xs text-dark-textMuted">Loading loads...</p>
              ) : loads.length === 0 ? (
                <p className="text-xs text-dark-textMuted">No shipments assigned to your organization.</p>
              ) : (
                <div className="space-y-3">
                  {loads.map(load => {
                    const isSelected = selectedLoad?.id === load.id;
                    return (
                      <button
                        key={load.id}
                        onClick={() => setSelectedLoad(load)}
                        className={`w-full text-left p-4 rounded-lg border transition-all ${
                          isSelected 
                            ? 'bg-emerald-500/10 border-emerald-500/40 shadow-glow-green' 
                            : 'bg-dark-bg/40 border-dark-border hover:border-dark-border/80'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] bg-dark-border text-dark-textMuted px-2 py-0.5 rounded font-mono font-semibold">
                            ID: {load.id}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            load.state === 'Invoiced/Closed' ? 'bg-dark-border text-dark-textMuted border border-dark-border' :
                            load.state === 'Delivered' || load.state === 'POD Verified' ? 'bg-accent-green/15 text-accent-green border border-accent-green/20' :
                            'bg-accent-blue/15 text-accent-blue border border-accent-blue/20'
                          }`}>
                            {load.state}
                          </span>
                        </div>
                        <div className="mt-2.5 font-bold text-sm text-white">{load.origin} → {load.destination}</div>
                        
                        {load.compliance_flag && (
                          <div className="mt-2 text-[10px] text-accent-red bg-accent-red/10 border border-accent-red/20 px-2 py-0.5 rounded font-semibold inline-block">
                            ⚠️ Compliance Hold Active
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Right Side: Detail & Action Panel */}
          <div className="lg:col-span-7">
            {selectedLoad ? (
              <div className="space-y-6">
                
                {/* Details */}
                <div className="glassmorphism rounded-xl p-6 space-y-6">
                  <div className="flex justify-between items-start border-b border-dark-border pb-4">
                    <div>
                      <span className="text-xs text-dark-textMuted font-mono">SHIPMENT ID #{selectedLoad.id}</span>
                      <h2 className="text-xl font-bold text-white mt-1">
                        {selectedLoad.origin} to {selectedLoad.destination}
                      </h2>
                    </div>
                    {selectedLoad.compliance_flag && (
                      <div className="text-right">
                        <span className="text-xs text-accent-red block font-bold">⚠️ Compliance Warning</span>
                        <span className="text-[10px] text-dark-textMuted mt-0.5 block max-w-xs">
                          Your profile has mismatching specifications or expired logs for this load. Updates require override.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-dark-bg/30 p-4 border border-dark-border/50 rounded-lg">
                    <div>
                      <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block">Equipment Type</span>
                      <span className="font-semibold text-sm text-white mt-1 block">{selectedLoad.equipment_type}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block">Commodity</span>
                      <span className="font-semibold text-sm text-white mt-1 block">{selectedLoad.commodity}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block">Shipper contact</span>
                      <span className="font-semibold text-sm text-white mt-1 block">{selectedLoad.shipper_name}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block">Rate Confirmed</span>
                      <span className="font-semibold text-sm text-emerald-400 mt-1 block">
                        {selectedLoad.latest_rate_confirmation ? `$${selectedLoad.latest_rate_confirmation}` : 'Awaiting confirmation'}
                      </span>
                    </div>
                  </div>

                  {/* Actions Drawer */}
                  <div className="p-5 bg-dark-bg/50 border border-dark-border rounded-xl shadow-inner">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Workflow Execution</h3>
                    {renderTransitionControls()}
                  </div>
                </div>

                {/* Audit trail / log */}
                <div className="glassmorphism rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Activity Audit Trail</h3>
                  <div className="relative pl-6 border-l border-dark-border space-y-6">
                    {selectedLoad.audit_events.map(event => (
                      <div key={event.id} className="relative">
                        <div className="absolute left-[-29px] top-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-dark-bg" />
                        <div className="text-xs text-dark-textMuted font-mono">
                          {new Date(event.timestamp).toLocaleString()}
                        </div>
                        <div className="mt-1 text-sm text-white font-semibold">
                          {event.from_state} → {event.to_state}
                        </div>
                        {event.note && (
                          <p className="mt-1 text-xs text-dark-textMuted italic bg-dark-bg/30 p-2 border border-dark-border/40 rounded">
                            {event.note}
                          </p>
                        )}
                        <div className="mt-1 text-[10px] text-dark-textMuted">
                          Action by: {event.actor_name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="glassmorphism rounded-xl p-12 text-center text-dark-textMuted">
                <span className="text-4xl block mb-4">🚛</span>
                Select an assigned shipment file from the board to update routing status, upload POD sheets, and review contract history.
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
