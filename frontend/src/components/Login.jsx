import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (demoEmail) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError('');
    setLoading(true);
    try {
      await login(demoEmail, 'password123');
    } catch (err) {
      setError(err.message || 'Quick login failed');
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    { name: 'Broker Admin', email: 'broker.admin@loadflow.com', color: 'border-indigo-500 hover:bg-indigo-900/35 text-indigo-300' },
    { name: 'Broker Dispatch', email: 'broker.dispatcher@loadflow.com', color: 'border-blue-500 hover:bg-blue-900/35 text-blue-300' },
    { name: 'Carrier Admin', email: 'carrier.admin@loadflow.com', color: 'border-emerald-500 hover:bg-emerald-900/35 text-emerald-300' },
    { name: 'Carrier Driver', email: 'carrier.driver@loadflow.com', color: 'border-cyan-500 hover:bg-cyan-900/35 text-cyan-300' },
    { name: 'Non-Compliant Carrier', email: 'lapsed.admin@loadflow.com', color: 'border-red-500 hover:bg-red-900/35 text-red-300' },
    { name: 'Shipper 1 (Produce)', email: 'shipper.global@loadflow.com', color: 'border-amber-500 hover:bg-amber-900/35 text-amber-300' },
    { name: 'Shipper 2 (Steel)', email: 'shipper.steel@loadflow.com', color: 'border-orange-500 hover:bg-orange-900/35 text-orange-300' },
  ];

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative gradient backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary-600/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-accent-blue/10 rounded-full blur-[100px]" />

      <div className="w-full max-w-5xl grid md:grid-cols-12 gap-8 items-center relative z-10">
        
        {/* Left branding panel */}
        <div className="md:col-span-5 text-left space-y-6">
          <div className="inline-flex items-center space-x-2 bg-primary-500/10 border border-primary-500/20 px-3 py-1.5 rounded-full">
            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-primary-300 uppercase tracking-widest">Enterprise Logistics</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
            LoadFlow <br />
            <span className="bg-gradient-to-r from-primary-400 via-indigo-300 to-accent-blue bg-clip-text text-transparent">
              Operations Portal
            </span>
          </h1>
          
          <p className="text-dark-textMuted text-base leading-relaxed">
            Secure, permission-based workflow dashboard connecting shippers, brokers, and carriers. Automated compliance gates and versioned rate confirmations.
          </p>

          <div className="hidden md:flex flex-col gap-4 text-sm text-dark-textMuted">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-dark-card border border-dark-border flex items-center justify-center text-primary-400">
                🛡️
              </div>
              <span>Strict Permission-Based Access Controls</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-dark-card border border-dark-border flex items-center justify-center text-accent-green">
                ⚡
              </div>
              <span>Live Insurance & Compliance Checks</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-dark-card border border-dark-border flex items-center justify-center text-accent-amber">
                📝
              </div>
              <span>Immutable Rate Confirmation Tracking</span>
            </div>
          </div>
        </div>

        {/* Right login form & demo accounts */}
        <div className="md:col-span-7 space-y-6">
          {/* Form */}
          <div className="glassmorphism rounded-2xl p-8 shadow-glow">
            <h2 className="text-2xl font-bold text-white mb-6">Access Account</h2>
            
            {error && (
              <div className="mb-6 bg-accent-red/10 border border-accent-red/20 text-accent-red px-4 py-3 rounded-lg text-sm flex items-center space-x-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-dark-textMuted mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-dark-bg/60 border border-dark-border focus:border-primary-500 focus:outline-none text-white placeholder-gray-500 transition-colors"
                  placeholder="name@company.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-textMuted mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-dark-bg/60 border border-dark-border focus:border-primary-500 focus:outline-none text-white placeholder-gray-500 transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-semibold rounded-lg shadow-md transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          </div>

          {/* Quick Logins (Wow factor - makes it extremely easy to use) */}
          <div className="glassmorphism rounded-2xl p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-dark-textMuted mb-4">
              Quick Seed Login Helper (Click to Auto-login)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {demoAccounts.map((account) => (
                <button
                  key={account.name}
                  type="button"
                  onClick={() => quickLogin(account.email)}
                  disabled={loading}
                  className={`px-3 py-2 text-xs border rounded-lg text-left transition-all duration-150 truncate ${account.color}`}
                >
                  <div className="font-semibold mb-0.5">{account.name}</div>
                  <div className="opacity-70 text-[10px] truncate">{account.email}</div>
                </button>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
