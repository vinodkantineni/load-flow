import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import RoleBuilder from './RoleBuilder';

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

export default function BrokerDashboard() {
  const { apiFetch, user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('loads'); // loads | admin
  const [loads, setLoads] = useState([]);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [shippers, setShippers] = useState([]);
  
  // Filtering & Stats
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [showComplianceOnly, setShowComplianceOnly] = useState(false);
  
  // Modals/Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [commodity, setCommodity] = useState('');
  const [equipmentType, setEquipmentType] = useState('Reefer');
  const [selectedShipperId, setSelectedShipperId] = useState('');
  const [createError, setCreateError] = useState('');

  // Assignment & Rate Confirmation
  const [assignCarrierId, setAssignCarrierId] = useState('');
  const [rateConfirmations, setRateConfirmations] = useState([]);
  const [baseRate, setBaseRate] = useState('');
  const [accessorialDesc, setAccessorialDesc] = useState('');
  const [accessorialAmt, setAccessorialAmt] = useState('');
  const [accessorialsList, setAccessorialsList] = useState([]);
  
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [transitionNote, setTransitionNote] = useState('');

  // Permissions checks
  const permissions = user?.role_name === 'Admin' ? [
    'load.create', 'load.assign_carrier', 'load.override_compliance_flag', 
    'rate.confirm', 'load.update_status', 'staff.manage', 'pod.upload'
  ] : (user?.role_id ? [] : []); // Shippers have none. Staff get permissions list.
  
  const hasPermission = (perm) => {
    // Admins have all permissions implicitly
    if (user?.role_name === 'Admin') return true;
    // In our JWT response we can also verify permissions if we pass them, or check against RoleBuilder
    // For simplicity, we can also check user.role_name
    if (user?.role_name === 'Ops Lead') {
      return perm !== 'pod.upload';
    }
    if (user?.role_name === 'Dispatcher') {
      return perm === 'load.assign_carrier' || perm === 'rate.confirm';
    }
    return false;
  };

  const fetchLoads = async () => {
    setLoading(true);
    try {
      let url = '/api/loads';
      const params = [];
      if (stateFilter) params.push(`state=${encodeURIComponent(stateFilter)}`);
      if (searchQuery) params.push(`destination=${encodeURIComponent(searchQuery)}`);
      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setLoads(data);
        if (selectedLoad) {
          const updated = data.find(l => l.id === selectedLoad.id);
          if (updated) {
            setSelectedLoad(updated);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCarriersAndShippers = async () => {
    try {
      const cRes = await apiFetch('/api/compliance/carriers');
      if (cRes.ok) setCarriers(await cRes.json());

      const sRes = await apiFetch('/api/auth/shippers');
      if (sRes.ok) {
        const data = await sRes.json();
        setShippers(data);
        if (data.length > 0) setSelectedShipperId(data[0].id.toString());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRateHistory = async (loadId) => {
    try {
      const res = await apiFetch(`/api/loads/${loadId}/rate-confirmations`);
      if (res.ok) setRateConfirmations(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLoads();
    fetchCarriersAndShippers();
  }, [stateFilter]);

  useEffect(() => {
    if (selectedLoad) {
      fetchRateHistory(selectedLoad.id);
    } else {
      setRateConfirmations([]);
    }
  }, [selectedLoad]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLoads();
  };

  const handleCreateLoad = async (e) => {
    e.preventDefault();
    setCreateError('');
    try {
      const res = await apiFetch('/api/loads', {
        method: 'POST',
        body: {
          shipper_id: parseInt(selectedShipperId),
          origin,
          destination,
          commodity,
          equipment_type: equipmentType
        }
      });

      if (res.ok) {
        setShowCreateModal(false);
        setOrigin('');
        setDestination('');
        setCommodity('');
        fetchLoads();
      } else {
        const err = await res.json();
        setCreateError(err.detail || 'Failed to create load');
      }
    } catch (err) {
      setCreateError('Network error creating load');
    }
  };

  const handleAssignCarrier = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');
    if (!assignCarrierId) return;

    try {
      const res = await apiFetch(`/api/loads/${selectedLoad.id}/assign-carrier`, {
        method: 'POST',
        body: { carrier_org_id: parseInt(assignCarrierId) }
      });

      if (res.ok) {
        setActionSuccess('Carrier assigned successfully.');
        setAssignCarrierId('');
        fetchLoads();
      } else {
        const err = await res.json();
        setActionError(err.detail || 'Assignment failed.');
      }
    } catch (err) {
      setActionError('Carrier assignment failed.');
    }
  };

  const handleAddAccessorial = (e) => {
    e.preventDefault();
    if (!accessorialDesc.trim() || !accessorialAmt) return;
    setAccessorialsList([
      ...accessorialsList,
      { description: accessorialDesc, amount: parseFloat(accessorialAmt) }
    ]);
    setAccessorialDesc('');
    setAccessorialAmt('');
  };

  const handleRemoveAccessorial = (index) => {
    setAccessorialsList(accessorialsList.filter((_, i) => i !== index));
  };

  const handleCreateRateConfirmation = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');
    if (!baseRate) return;

    try {
      const res = await apiFetch(`/api/loads/${selectedLoad.id}/rate-confirmation`, {
        method: 'POST',
        body: {
          base_rate: parseFloat(baseRate),
          accessorials: accessorialsList
        }
      });

      if (res.ok) {
        setActionSuccess('Rate confirmation version created successfully.');
        setBaseRate('');
        setAccessorialsList([]);
        fetchRateHistory(selectedLoad.id);
        fetchLoads();
      } else {
        const err = await res.json();
        setActionError(err.detail || 'Failed to create rate confirmation.');
      }
    } catch (err) {
      setActionError('Rate confirmation failed.');
    }
  };

  const handleTransition = async (toState) => {
    setActionError('');
    setActionSuccess('');
    try {
      const res = await apiFetch(`/api/loads/${selectedLoad.id}/transition`, {
        method: 'POST',
        body: { to_state: toState, note: transitionNote }
      });

      if (res.ok) {
        setActionSuccess(`Successfully transitioned load status to "${toState}"`);
        setTransitionNote('');
        fetchLoads();
      } else {
        const err = await res.json();
        setActionError(err.detail || 'State transition failed.');
      }
    } catch (err) {
      setActionError('Network or authorization error during transition.');
    }
  };

  const getNextState = (currentState) => {
    const idx = STATUS_STEPS.indexOf(currentState);
    if (idx !== -1 && idx < STATUS_STEPS.length - 1) {
      return STATUS_STEPS[idx + 1];
    }
    return null;
  };

  // Stats Counters
  const totalLoadsCount = loads.length;
  const holdLoadsCount = loads.filter(l => l.compliance_flag).length;
  const postedLoadsCount = loads.filter(l => l.state === 'Posted').length;
  const inTransitCount = loads.filter(l => l.state === 'In Transit').length;

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      {/* Navbar Header */}
      <header className="border-b border-dark-border bg-dark-card/50 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <span className="text-xl font-bold tracking-wider text-primary-400">LoadFlow</span>
              <span className="text-[10px] bg-primary-500/10 border border-primary-500/20 text-primary-300 px-2 py-0.5 rounded font-semibold uppercase">
                Broker Portal
              </span>
            </div>
            
            <nav className="hidden md:flex space-x-2">
              <button
                onClick={() => setActiveTab('loads')}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  activeTab === 'loads' ? 'bg-primary-600 text-white' : 'text-dark-textMuted hover:text-white'
                }`}
              >
                Load Board
              </button>
              {hasPermission('staff.manage') && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                    activeTab === 'admin' ? 'bg-primary-600 text-white' : 'text-dark-textMuted hover:text-white'
                  }`}
                >
                  Roles & Staff
                </button>
              )}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-semibold text-white">{user?.full_name}</div>
              <div className="text-[10px] text-dark-textMuted">Role: {user?.role_name || 'Broker Admin'}</div>
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

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {activeTab === 'admin' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Staff Management Console</h2>
              <button 
                onClick={() => setActiveTab('loads')}
                className="px-3 py-1.5 bg-dark-border hover:bg-dark-border/80 border border-dark-border rounded text-xs text-white transition-colors"
              >
                Back to Loads
              </button>
            </div>
            <RoleBuilder />
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Stats Dashboard Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div 
                onClick={() => setShowComplianceOnly(false)}
                className={`glassmorphism rounded-xl p-5 shadow-sm cursor-pointer border transition-all ${
                  !showComplianceOnly ? 'border-primary-500 bg-primary-600/5' : 'border-transparent'
                }`}
              >
                <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block font-semibold">Active Shipments</span>
                <span className="text-3xl font-extrabold text-white mt-1 block">{totalLoadsCount}</span>
              </div>
              <div 
                onClick={() => setShowComplianceOnly(true)}
                className={`glassmorphism rounded-xl p-5 border-l-4 border-l-accent-red shadow-sm cursor-pointer border transition-all ${
                  showComplianceOnly ? 'border-accent-red bg-accent-red/5' : 'border-transparent'
                }`}
              >
                <span className="text-[10px] text-accent-red uppercase tracking-wider block font-bold">Compliance Holds</span>
                <span className="text-3xl font-extrabold text-accent-red mt-1 block">{holdLoadsCount}</span>
              </div>
              <div className="glassmorphism rounded-xl p-5 shadow-sm border border-transparent">
                <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block font-semibold">Awaiting Carrier</span>
                <span className="text-3xl font-extrabold text-white mt-1 block">{postedLoadsCount}</span>
              </div>
              <div className="glassmorphism rounded-xl p-5 shadow-sm border border-transparent">
                <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block font-semibold">In Transit</span>
                <span className="text-3xl font-extrabold text-accent-blue mt-1 block">{inTransitCount}</span>
              </div>
            </div>

            {/* Core Workspace Grid */}
            <div className="grid lg:grid-cols-12 gap-8">
              
              {/* Load Board Panel */}
              <div className="lg:col-span-7 space-y-6">
                <div className="glassmorphism rounded-xl p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-base font-bold text-white uppercase tracking-wider">Load Dispatch Board</h3>
                      {showComplianceOnly && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-accent-red/20 text-accent-red border border-accent-red/30">
                          Compliance Alerts Only
                          <button 
                            type="button"
                            onClick={() => setShowComplianceOnly(false)}
                            className="ml-1 text-white hover:text-accent-red font-bold"
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </div>
                    {hasPermission('load.create') && (
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-semibold text-xs rounded transition-all"
                      >
                        + Create Shipment
                      </button>
                    )}
                  </div>

                  {/* Filter Form */}
                  <form onSubmit={handleSearchSubmit} className="grid sm:grid-cols-3 gap-3 mb-6 bg-dark-bg/30 p-3 rounded-lg border border-dark-border/40">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Destination city..."
                      className="px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border focus:border-primary-500 focus:outline-none"
                    />
                    <select
                      value={stateFilter}
                      onChange={(e) => setStateFilter(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border focus:outline-none text-white"
                    >
                      <option value="">All States</option>
                      {STATUS_STEPS.map(state => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                    <button 
                      type="submit"
                      className="py-1.5 bg-dark-border hover:bg-dark-border/80 border border-dark-border text-white text-xs font-semibold rounded transition-colors"
                    >
                      Apply Filter
                    </button>
                  </form>

                  {/* Load items table-like listing */}
                  {loading && loads.length === 0 ? (
                    <p className="text-xs text-dark-textMuted">Loading board shipments...</p>
                  ) : loads.length === 0 ? (
                    <p className="text-xs text-dark-textMuted">No shipments found in board database.</p>
                  ) : loads.filter(load => !showComplianceOnly || load.compliance_flag).length === 0 ? (
                    <p className="text-xs text-dark-textMuted p-4 text-center bg-dark-bg/20 border border-dark-border/40 rounded-lg">
                      No compliance hold alerts active.
                    </p>
                  ) : (
                    <div className="space-y-3.5 max-h-[550px] overflow-y-auto pr-1">
                      {loads.filter(load => !showComplianceOnly || load.compliance_flag).map(load => {
                        const isSelected = selectedLoad?.id === load.id;
                        return (
                          <div
                            key={load.id}
                            onClick={() => setSelectedLoad(load)}
                            className={`p-4 rounded-xl border cursor-pointer text-left transition-all ${
                              isSelected 
                                ? 'bg-primary-600/10 border-primary-500/50 shadow-glow' 
                                : load.compliance_flag 
                                  ? 'bg-accent-red/5 border-accent-red/20 hover:border-accent-red/40'
                                  : 'bg-dark-bg/40 border-dark-border hover:border-dark-border/80'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] bg-dark-border text-dark-textMuted px-2 py-0.5 rounded font-mono font-semibold">
                                ID: {load.id}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                load.state === 'Invoiced/Closed' ? 'bg-dark-border text-dark-textMuted border border-dark-border' :
                                load.state === 'In Transit' ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/20' :
                                load.state === 'Delivered' || load.state === 'POD Verified' ? 'bg-accent-green/15 text-accent-green border border-accent-green/20' :
                                'bg-accent-amber/15 text-accent-amber border border-accent-amber/20'
                              }`}>
                                {load.state}
                              </span>
                            </div>
                            <div className="mt-3 font-bold text-sm text-white">
                              {load.origin} → {load.destination}
                            </div>
                            <div className="mt-2.5 flex items-center justify-between text-xs text-dark-textMuted">
                              <span>Partner: <strong className="text-white">{load.carrier_name || 'Unassigned'}</strong></span>
                              {load.compliance_flag && (
                                <span className="text-[10px] text-accent-red font-bold animate-pulse">
                                  ⚠️ Compliance Hold
                                </span>
                              )}
                              {!load.compliance_flag && load.carrier_name && (
                                <span className="text-[10px] text-accent-green font-bold">
                                  ✓ Compliant
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              </div>

              {/* Details & In-depth Operations Drawer */}
              <div className="lg:col-span-5 space-y-6">
                {selectedLoad ? (
                  <div className="space-y-6">
                    
                    {/* Selected Load Summary Card */}
                    <div className="glassmorphism rounded-xl p-6 space-y-5">
                      <div className="flex justify-between items-start border-b border-dark-border/60 pb-3.5">
                        <div>
                          <span className="text-[10px] text-dark-textMuted font-mono">LOAD SPECIFICATION</span>
                          <h4 className="text-base font-bold text-white mt-1">
                            {selectedLoad.origin} to {selectedLoad.destination}
                          </h4>
                        </div>
                        <span className="text-xs bg-indigo-900/40 border border-indigo-700 text-indigo-300 px-2 py-0.5 rounded font-mono">
                          #{selectedLoad.id}
                        </span>
                      </div>

                      {/* Info fields */}
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-dark-textMuted block">Equipment:</span>
                          <span className="font-semibold text-white mt-0.5 block">{selectedLoad.equipment_type}</span>
                        </div>
                        <div>
                          <span className="text-dark-textMuted block">Commodity:</span>
                          <span className="font-semibold text-white mt-0.5 block">{selectedLoad.commodity}</span>
                        </div>
                        <div>
                          <span className="text-dark-textMuted block">Shipper Partner:</span>
                          <span className="font-semibold text-white mt-0.5 block">{selectedLoad.shipper_name}</span>
                        </div>
                        <div>
                          <span className="text-dark-textMuted block">Base Cost Rate:</span>
                          <span className="font-semibold text-indigo-400 mt-0.5 block">
                            {selectedLoad.latest_rate_confirmation ? `$${selectedLoad.latest_rate_confirmation}` : 'TBD'}
                          </span>
                        </div>
                      </div>

                      {/* Compliance hold banner */}
                      {selectedLoad.compliance_flag && (
                        <div className="bg-accent-red/10 border border-accent-red/20 text-accent-red p-3.5 rounded-lg text-xs space-y-2">
                          <div className="flex items-center space-x-2 font-bold">
                            <span>⚠️</span>
                            <span>COMPLIANCE HOLD ACTIVE</span>
                          </div>
                          <p className="text-[11px] text-dark-textMuted leading-normal">
                            Carrier partner compliance documents are lapsed or mismatching. State transitions past "Carrier Assigned" are locked.
                          </p>
                          {hasPermission('load.override_compliance_flag') && (
                            <button
                              onClick={() => {
                                const nextSt = getNextState(selectedLoad.state);
                                if (nextSt) {
                                  if (confirm(`Compliance override: force transition load to "${nextSt}"? This will log an audit note.`)) {
                                    handleTransition(nextSt);
                                  }
                                }
                              }}
                              className="px-3 py-1 bg-accent-red text-white rounded hover:bg-accent-red/95 font-semibold text-[10px] tracking-wide uppercase transition-colors"
                            >
                              Override Compliance Hold
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action responses */}
                    {(actionError || actionSuccess) && (
                      <div className="space-y-2">
                        {actionError && (
                          <div className="bg-accent-red/10 border border-accent-red/20 text-accent-red px-3 py-2.5 rounded-lg text-xs flex items-center space-x-2">
                            <span>⚠️</span>
                            <span>{actionError}</span>
                          </div>
                        )}
                        {actionSuccess && (
                          <div className="bg-accent-green/10 border border-accent-green/20 text-accent-green px-3 py-2.5 rounded-lg text-xs flex items-center space-x-2">
                            <span>✅</span>
                            <span>{actionSuccess}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Operational Workflows Panels */}
                    <div className="glassmorphism rounded-xl p-6 space-y-6">
                      
                      {/* Workflow 1: Carrier Assignment */}
                      {selectedLoad.state === 'Posted' && (
                        <form onSubmit={handleAssignCarrier} className="space-y-4 border-b border-dark-border/50 pb-6">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Assign Carrier Partner</h4>
                          <div className="flex space-x-2">
                            <select
                              value={assignCarrierId}
                              onChange={(e) => setAssignCarrierId(e.target.value)}
                              className="flex-1 px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                              required
                            >
                              <option value="">Select Carrier...</option>
                              {carriers.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              disabled={!assignCarrierId || !hasPermission('load.assign_carrier')}
                              className="px-4 py-1.5 bg-primary-600 hover:bg-primary-500 text-white font-semibold text-xs rounded transition-colors disabled:opacity-50"
                            >
                              Assign
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Workflow 2: Rate Confirmation */}
                      {selectedLoad.state === 'Carrier Assigned' && (
                        <div className="border-b border-dark-border/50 pb-6 space-y-4">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Approve Rate Confirmation</h4>
                          <p className="text-[11px] text-dark-textMuted leading-normal">
                            Enter the base cargo hauling rate and any accessorial costs. Rate is versioned and saved as contract.
                          </p>

                          <form onSubmit={handleCreateRateConfirmation} className="space-y-3">
                            <div className="flex space-x-2">
                              <input
                                type="number"
                                step="0.01"
                                value={baseRate}
                                onChange={(e) => setBaseRate(e.target.value)}
                                placeholder="Base Rate Amount ($)..."
                                className="flex-1 px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                                required
                              />
                              <button
                                type="submit"
                                disabled={!baseRate || !hasPermission('rate.confirm')}
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded transition-colors disabled:opacity-50"
                              >
                                Confirm Rate Contract
                              </button>
                            </div>
                          </form>

                          {/* Accessorials Form */}
                          <div className="space-y-3 bg-dark-bg/30 p-3.5 border border-dark-border/60 rounded">
                            <div className="text-[10px] font-bold text-white uppercase tracking-wider">Add Accessorial Charges</div>
                            <form onSubmit={handleAddAccessorial} className="flex gap-2 flex-wrap sm:flex-nowrap">
                              <input
                                type="text"
                                value={accessorialDesc}
                                onChange={(e) => setAccessorialDesc(e.target.value)}
                                placeholder="e.g. Fuel Surcharge"
                                className="flex-1 px-2.5 py-1 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={accessorialAmt}
                                onChange={(e) => setAccessorialAmt(e.target.value)}
                                placeholder="Amount ($)"
                                className="w-24 px-2.5 py-1 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="px-3 py-1 bg-dark-border hover:bg-dark-border/80 border border-dark-border text-white text-[10px] rounded"
                              >
                                Add
                              </button>
                            </form>

                            {/* Accessorial list preview */}
                            {accessorialsList.length > 0 && (
                              <div className="mt-3.5 space-y-1.5 border-t border-dark-border/50 pt-2.5">
                                {accessorialsList.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-[10px] text-white">
                                    <span>{item.description}: <strong>${item.amount}</strong></span>
                                    <button 
                                      onClick={() => handleRemoveAccessorial(idx)}
                                      className="text-accent-red hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Workflow 3: Generic Transitions */}
                      {selectedLoad.state !== 'Posted' && selectedLoad.state !== 'Carrier Assigned' && selectedLoad.state !== 'Invoiced/Closed' && (
                        <div className="border-b border-dark-border/50 pb-6 space-y-4">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Execute State Progression</h4>
                          <p className="text-[11px] text-dark-textMuted leading-normal">
                            Advance shipment files down the lifecycle checklist. Current status: <strong className="text-white">{selectedLoad.state}</strong>.
                          </p>

                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={transitionNote}
                              onChange={(e) => setTransitionNote(e.target.value)}
                              placeholder="Add transit audit log note..."
                              className="flex-1 px-3 py-1.5 text-xs rounded bg-dark-bg/60 border border-dark-border text-white focus:outline-none"
                            />
                            {getNextState(selectedLoad.state) && (
                              <button
                                onClick={() => handleTransition(getNextState(selectedLoad.state))}
                                className="px-4 py-1.5 bg-primary-600 hover:bg-primary-500 text-white font-semibold text-xs rounded transition-colors"
                              >
                                Transition to {getNextState(selectedLoad.state)}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Closing invoice workflow */}
                      {selectedLoad.state === 'POD Verified' && (
                        <div className="border-b border-dark-border/50 pb-6 space-y-4">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Close Load File</h4>
                          <p className="text-xs text-dark-textMuted">
                            The carrier has successfully uploaded the signed POD. You can now close and archive the load file.
                          </p>
                          <button
                            onClick={() => handleTransition('Invoiced/Closed')}
                            className="w-full py-2 bg-gradient-to-r from-accent-green to-emerald-600 hover:from-accent-green hover:to-emerald-500 text-white font-semibold text-xs rounded transition-all"
                          >
                            Invoiced / Close Shipment
                          </button>
                        </div>
                      )}

                      {/* Display contracts list if available */}
                      {rateConfirmations.length > 0 && (
                        <div className="space-y-3 pt-2">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Contract Rate History</h4>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {rateConfirmations.map(conf => (
                              <div key={conf.id} className="p-3 bg-dark-bg/40 border border-dark-border/60 rounded text-[11px]">
                                <div className="flex justify-between items-center text-white">
                                  <span className="font-semibold text-primary-300">Version #{conf.version}</span>
                                  <span className="font-bold">${conf.base_rate}</span>
                                </div>
                                <div className="text-[10px] text-dark-textMuted mt-1">
                                  Confirmed: {new Date(conf.confirmed_at).toLocaleString()} by {conf.confirmed_by_name}
                                </div>
                                {conf.accessorials.length > 0 && (
                                  <div className="mt-2 space-y-0.5 border-t border-dark-border/30 pt-1.5">
                                    {conf.accessorials.map((acc, i) => (
                                      <div key={i} className="flex justify-between text-[10px] text-dark-textMuted">
                                        <span>{acc.description}</span>
                                        <span>+${acc.amount}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Milestones log */}
                    <div className="glassmorphism rounded-xl p-6">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Log Milestones</h4>
                      <div className="relative pl-6 border-l border-dark-border space-y-5">
                        {selectedLoad.audit_events.map(event => (
                          <div key={event.id} className="relative">
                            <div className="absolute left-[-29px] top-1.5 w-2 h-2 rounded-full bg-primary-500 ring-4 ring-dark-bg" />
                            <div className="text-[10px] text-dark-textMuted font-mono">
                              {new Date(event.timestamp).toLocaleString()}
                            </div>
                            <div className="mt-1 text-xs text-white font-semibold">
                              State: {event.from_state} → {event.to_state}
                            </div>
                            {event.note && (
                              <p className="mt-1 text-[11px] text-dark-textMuted italic bg-dark-bg/20 p-1.5 border border-dark-border/40 rounded">
                                {event.note}
                              </p>
                            )}
                            <div className="mt-1 text-[9px] text-dark-textMuted">
                              User: {event.actor_name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="glassmorphism rounded-xl p-12 text-center text-dark-textMuted">
                    <span className="text-4xl block mb-4">📊</span>
                    Select a shipment file from the load dispatch board to manage rate confirmations, assign carriers, execute state transitions, and view compliance status.
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Create Load Modal (Wow effect with modal blur) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glassmorphism rounded-2xl p-8 shadow-glow">
            <h3 className="text-xl font-bold text-white mb-5">Create New Cargo Shipment</h3>
            
            {createError && (
              <div className="mb-4 bg-accent-red/10 border border-accent-red/20 text-accent-red px-3 py-2 rounded text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateLoad} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Shipper Client Account</label>
                <select
                  value={selectedShipperId}
                  onChange={(e) => setSelectedShipperId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                  required
                >
                  <option value="" disabled>Select Shipper Client...</option>
                  {shippers.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Origin City & State</label>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="e.g. Salinas, CA"
                  className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Destination City & State</label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Chicago, IL"
                  className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Commodity Description</label>
                <input
                  type="text"
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                  placeholder="e.g. Fresh Produce"
                  className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Required Equipment Type</label>
                <select
                  value={equipmentType}
                  onChange={(e) => setEquipmentType(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                >
                  <option value="Reefer">Reefer (Refrigerated)</option>
                  <option value="Flatbed">Flatbed Trailer</option>
                  <option value="Dry Van">Dry Van Box Trailer</option>
                </select>
              </div>
              

              <div className="flex justify-end space-x-3 pt-3 border-t border-dark-border/40 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-dark-border hover:bg-dark-border/80 border border-dark-border text-white text-xs font-semibold rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-semibold text-xs rounded shadow-md"
                >
                  Post Shipment Load
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
