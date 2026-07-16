import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const PERMISSION_CATALOG = [
  { id: 'load.create', name: 'Create Load', desc: 'Allows creating new shipments' },
  { id: 'load.assign_carrier', name: 'Assign Carrier', desc: 'Assigns carriers to shipments and triggers compliance check' },
  { id: 'load.override_compliance_flag', name: 'Override Compliance', desc: 'Allows state transitions past assigned for non-compliant carriers' },
  { id: 'rate.confirm', name: 'Confirm Rate', desc: 'Allows creating and confirming rate confirmation documents' },
  { id: 'load.update_status', name: 'Update Load Status', desc: 'Allows changing transit states of loads' },
  { id: 'staff.manage', name: 'Manage Staff', desc: 'Full administrative access to manage roles and users' },
  { id: 'pod.upload', name: 'Upload POD', desc: 'Allows carrier drivers to upload Proof of Delivery' },
];

export default function RoleBuilder() {
  const { apiFetch } = useAuth();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Role Form
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState([]);

  // Edit Role Mode
  const [editingRole, setEditingRole] = useState(null);

  // Staff Form
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffRoleId, setStaffRoleId] = useState('');

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(data);
        if (data.length > 0) {
          setStaffRoleId(data[0].id);
        }
      }
    } catch (err) {
      setError('Could not fetch roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handlePermissionChange = (permId) => {
    if (selectedPermissions.includes(permId)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== permId));
    } else {
      setSelectedPermissions([...selectedPermissions, permId]);
    }
  };

  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newRoleName.trim()) {
      setError('Role name is required.');
      return;
    }

    try {
      if (editingRole) {
        // Update
        const res = await apiFetch(`/api/roles/${editingRole.id}`, {
          method: 'PATCH',
          body: { permissions: selectedPermissions }
        });
        if (res.ok) {
          setSuccess(`Role "${editingRole.name}" updated successfully.`);
          setEditingRole(null);
          setNewRoleName('');
          setSelectedPermissions([]);
          fetchRoles();
        } else {
          const err = await res.json();
          setError(err.detail || 'Could not update role.');
        }
      } else {
        // Create
        const res = await apiFetch('/api/roles', {
          method: 'POST',
          body: { name: newRoleName, permissions: selectedPermissions }
        });
        if (res.ok) {
          setSuccess(`Role "${newRoleName}" created successfully.`);
          setNewRoleName('');
          setSelectedPermissions([]);
          fetchRoles();
        } else {
          const err = await res.json();
          setError(err.detail || 'Could not create role.');
        }
      }
    } catch (err) {
      setError('Action failed.');
    }
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!staffEmail.trim() || !staffPassword || !staffName.trim() || !staffRoleId) {
      setError('All fields are required to create staff.');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/staff', {
        method: 'POST',
        body: {
          email: staffEmail,
          password: staffPassword,
          full_name: staffName,
          role_id: parseInt(staffRoleId)
        }
      });

      if (res.ok) {
        setSuccess(`Staff user "${staffName}" registered successfully.`);
        setStaffEmail('');
        setStaffPassword('');
        setStaffName('');
      } else {
        const err = await res.json();
        setError(err.detail || 'Could not create staff user.');
      }
    } catch (err) {
      setError('Action failed.');
    }
  };

  const startEdit = (role) => {
    setEditingRole(role);
    setNewRoleName(role.name);
    setSelectedPermissions(role.permissions);
  };

  const cancelEdit = () => {
    setEditingRole(null);
    setNewRoleName('');
    setSelectedPermissions([]);
  };

  return (
    <div className="grid lg:grid-cols-12 gap-8">
      {/* Messages */}
      <div className="lg:col-span-12">
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

      {/* Column 1: Roles List and Role Form */}
      <div className="lg:col-span-7 space-y-6">
        <div className="glassmorphism rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Organizational Roles</h3>
          {loading ? (
            <p className="text-dark-textMuted text-sm">Loading roles...</p>
          ) : (
            <div className="space-y-3">
              {roles.map(role => (
                <div key={role.id} className="p-4 bg-dark-bg/40 border border-dark-border rounded-lg flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-white text-sm">{role.name}</h4>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {role.permissions.length === 0 ? (
                        <span className="text-[10px] bg-dark-card border border-dark-border text-dark-textMuted px-2 py-0.5 rounded">No permissions</span>
                      ) : (
                        role.permissions.map(perm => (
                          <span key={perm} className="text-[10px] bg-primary-600/10 border border-primary-500/20 text-primary-300 px-2 py-0.5 rounded">
                            {perm}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => startEdit(role)}
                    className="text-xs bg-dark-border hover:bg-dark-border/80 border border-dark-border px-2.5 py-1 rounded text-white transition-colors"
                  >
                    Edit Perms
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Role Builder Form */}
        <div className="glassmorphism rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingRole ? `Edit Role: ${editingRole.name}` : 'Create Custom Role'}
          </h3>
          <form onSubmit={handleRoleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-2">Role Name</label>
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                disabled={!!editingRole}
                className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none disabled:opacity-50"
                placeholder="e.g. Lead Dispatcher"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-3">Permissions checklist</label>
              <div className="grid sm:grid-cols-2 gap-3.5">
                {PERMISSION_CATALOG.map(perm => (
                  <label 
                    key={perm.id} 
                    className="flex items-start space-x-3 p-3 bg-dark-bg/30 border border-dark-border/50 rounded-lg cursor-pointer hover:border-dark-border transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(perm.id)}
                      onChange={() => handlePermissionChange(perm.id)}
                      className="mt-0.5 w-4 h-4 text-primary-600 rounded bg-dark-bg border-dark-border"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">{perm.name}</div>
                      <div className="text-[10px] text-dark-textMuted mt-0.5">{perm.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-semibold text-xs rounded transition-all"
              >
                {editingRole ? 'Update Permissions' : 'Create Role'}
              </button>
              {editingRole && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 bg-dark-border hover:bg-dark-border/80 border border-dark-border text-white text-xs rounded transition-all"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Column 2: Staff Creator Form */}
      <div className="lg:col-span-5">
        <div className="glassmorphism rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Register Staff User</h3>
          <form onSubmit={handleStaffSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Email Address</label>
              <input
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                placeholder="john.doe@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Temporary Password</label>
              <input
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-textMuted uppercase tracking-wider mb-1.5">Assign Role</label>
              <select
                value={staffRoleId}
                onChange={(e) => setStaffRoleId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-dark-bg/60 border border-dark-border text-white text-sm focus:border-primary-500 focus:outline-none"
                required
              >
                {roles.length === 0 ? (
                  <option value="">No roles available</option>
                ) : (
                  roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))
                )}
              </select>
            </div>

            <button
              type="submit"
              disabled={roles.length === 0}
              className="w-full mt-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Register & Assign Role
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
