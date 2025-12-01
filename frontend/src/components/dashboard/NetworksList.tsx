import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { networksApi, devicesApi } from '../../api';
import type { Network } from '../../types';

const NetworksList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showRegisterDevice, setShowRegisterDevice] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [deviceData, setDeviceData] = useState({
    boardId: '',
    deviceType: 'BASE_STATION' as 'BASE_STATION' | 'FIELD_UNIT',
    name: '',
  });

  const { data: networks = [], isLoading } = useQuery({
    queryKey: ['networks'],
    queryFn: networksApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: networksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      setShowCreateForm(false);
      setFormData({ name: '', description: '' });
    },
  });

  const registerDeviceMutation = useMutation({
    mutationFn: ({ networkId, data }: { networkId: string; data: any }) =>
      devicesApi.register(networkId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setShowRegisterDevice(null);
      setDeviceData({ boardId: '', deviceType: 'BASE_STATION', name: '' });
    },
  });

  const handleCreateNetwork = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleRegisterDevice = (e: React.FormEvent, networkId: string) => {
    e.preventDefault();
    registerDeviceMutation.mutate({ networkId, data: deviceData });
  };

  if (isLoading) {
    return <div className="p-6">Loading networks...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Networks</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showCreateForm ? 'Cancel' : 'Create Network'}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create New Network</h2>
          <form onSubmit={handleCreateNetwork} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Network Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., New Year Event 2025"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
                placeholder="Optional description"
              />
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Network'}
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {networks.map((network: Network) => (
          <div key={network.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{network.name}</h3>
              {network.description && (
                <p className="text-sm text-gray-600 mb-4">{network.description}</p>
              )}
              <div className="text-sm text-gray-500 mb-4">
                {network._count?.devices || 0} device(s)
              </div>
              
              <div className="space-y-2">
                <button
                  onClick={() => navigate(`/dashboard/${network.id}`)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Open Dashboard
                </button>
                
                {showRegisterDevice === network.id ? (
                  <div className="mt-4 p-4 bg-gray-50 rounded">
                    <h4 className="text-sm font-semibold mb-2">Register Device</h4>
                    <form onSubmit={(e) => handleRegisterDevice(e, network.id)} className="space-y-2">
                      <input
                        type="text"
                        required
                        maxLength={12}
                        minLength={12}
                        value={deviceData.boardId}
                        onChange={(e) => setDeviceData({ ...deviceData, boardId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        placeholder="12-digit Board ID"
                      />
                      <select
                        value={deviceData.deviceType}
                        onChange={(e) => setDeviceData({ ...deviceData, deviceType: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      >
                        <option value="BASE_STATION">Base Station</option>
                        <option value="FIELD_UNIT">Field Unit</option>
                      </select>
                      <input
                        type="text"
                        value={deviceData.name}
                        onChange={(e) => setDeviceData({ ...deviceData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        placeholder="Name (optional)"
                      />
                      <div className="flex space-x-2">
                        <button
                          type="submit"
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          Register
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRegisterDevice(null)}
                          className="flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRegisterDevice(network.id)}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Register Device
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {networks.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No networks found. Create one to get started!
        </div>
      )}
    </div>
  );
};

export default NetworksList;
