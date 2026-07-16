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

export default function ShipperDashboard() {
  const { apiFetch, user, logout } = useAuth();
  const [loads, setLoads] = useState([]);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');

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
        // Sync selected load
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

  useEffect(() => {
    fetchLoads();
  }, [stateFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLoads();
  };

  const getStepIndex = (currentState) => {
    return STATUS_STEPS.indexOf(currentState);
  };

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      {/* Header */}
      <header className="border-b border-dark-border bg-dark-card/50 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-bold tracking-wider text-indigo-400">LoadFlow</span>
            <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-semibold uppercase">
              Shipper Portal
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-semibold text-white">{user?.full_name}</div>
              <div className="text-[10px] text-dark-textMuted">Shipper Account</div>
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

      {/* Main body */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left panel: Filters & Loads List */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glassmorphism rounded-xl p-6">
              <h2 className="text-base font-bold text-white mb-4">Track Cargo</h2>
              
              <form onSubmit={handleSearchSubmit} className="space-y-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by destination..."
                    className="flex-1 px-3 py-2 text-xs rounded bg-dark-bg/60 border border-dark-border focus:border-primary-500 focus:outline-none"
                  />
                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-semibold text-xs rounded transition-colors"
                  >
                    Search
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-textMuted">Status Filter:</span>
                  <select
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    className="px-2 py-1 text-xs rounded bg-dark-bg/60 border border-dark-border focus:outline-none text-white"
                  >
                    <option value="">All States</option>
                    {STATUS_STEPS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </form>
            </div>

            <div className="glassmorphism rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Your Shipments</h3>
                <span className="text-xs bg-dark-border px-2 py-0.5 rounded text-dark-textMuted">{loads.length} total</span>
              </div>
              
              {loading && loads.length === 0 ? (
                <p className="text-xs text-dark-textMuted">Fetching loads...</p>
              ) : loads.length === 0 ? (
                <p className="text-xs text-dark-textMuted">No shipments found matching filters.</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {loads.map(load => {
                    const isSelected = selectedLoad?.id === load.id;
                    return (
                      <button
                        key={load.id}
                        onClick={() => setSelectedLoad(load)}
                        className={`w-full text-left p-4 rounded-lg border transition-all ${
                          isSelected 
                            ? 'bg-primary-600/10 border-primary-500/50 shadow-glow' 
                            : 'bg-dark-bg/40 border-dark-border hover:border-dark-border/80'
                        }`}
                      >
                        <div className="flex justify-between items-start">
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
                        <div className="mt-3 font-semibold text-sm text-white">
                          {load.origin} → {load.destination}
                        </div>
                        <div className="mt-2 text-xs text-dark-textMuted flex items-center justify-between">
                          <span>Commodity: <strong className="text-white">{load.commodity}</strong></span>
                          {load.latest_rate_confirmation && (
                            <span className="text-primary-300 font-semibold">${load.latest_rate_confirmation}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Shipment Tracker Detail */}
          <div className="lg:col-span-7">
            {selectedLoad ? (
              <div className="space-y-6">
                {/* Details Card */}
                <div className="glassmorphism rounded-xl p-6 space-y-6">
                  <div className="flex justify-between items-start border-b border-dark-border/60 pb-4">
                    <div>
                      <span className="text-xs text-dark-textMuted font-mono">LOAD ID #{selectedLoad.id}</span>
                      <h2 className="text-xl font-bold text-white mt-1">
                        {selectedLoad.origin} to {selectedLoad.destination}
                      </h2>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-dark-textMuted block">Broker Org</span>
                      <span className="font-semibold text-sm text-white block mt-0.5">{selectedLoad.broker_name}</span>
                    </div>
                  </div>

                  {/* Horizontal State Stepper */}
                  <div className="py-4 overflow-x-auto">
                    <div className="min-w-[600px] flex items-center justify-between relative px-2">
                      <div className="absolute top-[15px] left-0 right-0 h-0.5 bg-dark-border z-0" />
                      
                      {STATUS_STEPS.map((step, idx) => {
                        const currentIdx = getStepIndex(selectedLoad.state);
                        const isCompleted = idx <= currentIdx;
                        const isActive = idx === currentIdx;
                        
                        return (
                          <div key={step} className="flex flex-col items-center z-10 relative">
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold transition-all ${
                              isActive 
                                ? 'bg-primary-600 border-primary-500 text-white shadow-glow' 
                                : isCompleted 
                                  ? 'bg-indigo-900 border-indigo-700 text-indigo-200' 
                                  : 'bg-dark-bg border-dark-border text-dark-textMuted'
                            }`}>
                              {isCompleted ? '✓' : idx + 1}
                            </div>
                            <span className={`text-[10px] font-semibold mt-2.5 max-w-[80px] text-center truncate ${
                              isActive ? 'text-primary-300' : isCompleted ? 'text-white' : 'text-dark-textMuted'
                            }`}>
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Spec grid */}
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
                      <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block">Carrier Partner</span>
                      <span className="font-semibold text-sm text-white mt-1 block">
                        {selectedLoad.carrier_name || 'Unassigned'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-dark-textMuted uppercase tracking-wider block">Total Base Cost</span>
                      <span className="font-semibold text-sm text-indigo-400 mt-1 block">
                        {selectedLoad.latest_rate_confirmation ? `$${selectedLoad.latest_rate_confirmation}` : 'TBD'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Audit history events */}
                <div className="glassmorphism rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Milestones & History</h3>
                  
                  <div className="relative pl-6 border-l border-dark-border space-y-6">
                    {selectedLoad.audit_events.map(event => (
                      <div key={event.id} className="relative">
                        <div className="absolute left-[-29px] top-1.5 w-2 h-2 rounded-full bg-primary-500 ring-4 ring-dark-bg" />
                        <div className="text-xs text-dark-textMuted font-mono">
                          {new Date(event.timestamp).toLocaleString()}
                        </div>
                        <div className="mt-1 text-sm text-white font-semibold">
                          Transitioned from <strong className="text-indigo-400">{event.from_state}</strong> to <strong className="text-emerald-400">{event.to_state}</strong>
                        </div>
                        {event.note && (
                          <p className="mt-1 text-xs text-dark-textMuted italic bg-dark-bg/30 p-2 border border-dark-border/40 rounded">
                            {event.note}
                          </p>
                        )}
                        <div className="mt-1 text-[10px] text-dark-textMuted">
                          Logged by: {event.actor_name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="glassmorphism rounded-xl p-12 text-center text-dark-textMuted">
                <span className="text-4xl block mb-4">📦</span>
                Select a shipment from the list to track its live logistics lifecycle, status milestones, and billing logs.
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
