import React from 'react';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import BrokerDashboard from './components/BrokerDashboard';
import CarrierDashboard from './components/CarrierDashboard';
import ShipperDashboard from './components/ShipperDashboard';

function App() {
  const { token, user } = useAuth();

  if (!token || !user) {
    return <Login />;
  }

  // Route based on organization type
  switch (user.org_type) {
    case 'broker':
      return <BrokerDashboard />;
    case 'carrier':
      return <CarrierDashboard />;
    case 'shipper':
      return <ShipperDashboard />;
    default:
      return (
        <div className="min-h-screen bg-dark-bg text-white flex items-center justify-center p-4">
          <div className="glassmorphism p-8 rounded-xl max-w-md text-center space-y-4">
            <h2 className="text-xl font-bold text-accent-red">Invalid Account Scope</h2>
            <p className="text-xs text-dark-textMuted leading-relaxed">
              Your account organization type <strong className="text-white">"{user.org_type}"</strong> is not recognized by this portal. Please contact the administrator.
            </p>
          </div>
        </div>
      );
  }
}

export default App;
