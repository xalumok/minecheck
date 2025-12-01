import React, { useMemo } from 'react';
import { Device, Network } from '../../types';
import { commandsApi } from '../../api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ListViewProps {
  devices: Device[];
  network: Network;
}

const ListView: React.FC<ListViewProps> = ({ devices, network }) => {
  const queryClient = useQueryClient();

  const sendCommandMutation = useMutation({
    mutationFn: commandsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', network.id] });
    },
  });

  const handleIgnite = async (device: Device) => {
    if (confirm(`Are you sure you want to IGNITE ${device.name || device.boardId}?`)) {
      try {
        await sendCommandMutation.mutateAsync({
          targetDeviceId: device.id,
          messageType: 'MSG_TYPE_IGNITE',
          priority: 'CRITICAL',
        });
        alert('Ignition command sent!');
      } catch (error: any) {
        alert(error.response?.data?.error || 'Failed to send command');
      }
    }
  };

  const handleBatteryCheck = async (device: Device) => {
    try {
      await sendCommandMutation.mutateAsync({
        targetDeviceId: device.id,
        messageType: 'MSG_TYPE_BATT',
        priority: 'NORMAL',
      });
      alert('Battery check requested');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send command');
    }
  };

  const handleGPSUpdate = async (device: Device) => {
    try {
      await sendCommandMutation.mutateAsync({
        targetDeviceId: device.id,
        messageType: 'MSG_TYPE_GPS',
        priority: 'NORMAL',
      });
      alert('GPS update requested');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send command');
    }
  };

  const handlePing = async (device: Device) => {
    try {
      await sendCommandMutation.mutateAsync({
        targetDeviceId: device.id,
        messageType: 'MSG_TYPE_PING',
        priority: 'NORMAL',
      });
      alert('Ping sent');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send command');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ONLINE: 'bg-green-100 text-green-800',
      OFFLINE: 'bg-red-100 text-red-800',
      LOW_BATTERY: 'bg-yellow-100 text-yellow-800',
      DISCOVERED: 'bg-blue-100 text-blue-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const fieldUnits = useMemo(
    () => devices.filter(d => d.deviceType === 'FIELD_UNIT'),
    [devices]
  );

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Device
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Battery
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  GPS
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Seen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {devices.map(device => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {device.name || device.boardId}
                    </div>
                    <div className="text-xs text-gray-500">{device.boardId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {device.deviceType === 'BASE_STATION' ? 'Base Station' : 'Field Unit'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {device.batteryPercent !== null && device.batteryPercent !== undefined ? (
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className={`h-2 rounded-full ${
                              device.batteryPercent > 50
                                ? 'bg-green-500'
                                : device.batteryPercent > 20
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${device.batteryPercent}%` }}
                          />
                        </div>
                        <span>{device.batteryPercent}%</span>
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {device.latitude && device.longitude ? (
                      <span className="text-xs">
                        {device.latitude.toFixed(4)}, {device.longitude.toFixed(4)}
                      </span>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(device.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {device.deviceType === 'FIELD_UNIT' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleIgnite(device)}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs font-medium"
                        >
                          IGNITE
                        </button>
                        <button
                          onClick={() => handleBatteryCheck(device)}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-medium"
                        >
                          Battery
                        </button>
                        <button
                          onClick={() => handleGPSUpdate(device)}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-medium"
                        >
                          GPS
                        </button>
                        <button
                          onClick={() => handlePing(device)}
                          className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-xs font-medium"
                        >
                          Ping
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {devices.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No devices found in this network
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ListView;
