import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { networksApi, devicesApi } from '../../api';
import MapView from './MapView';
import ListView from './ListView';
import { Device } from '../../types';

type ViewMode = 'map' | 'list';

const Dashboard: React.FC = () => {
  const { networkId } = useParams<{ networkId: string }>();
  const [viewMode, setViewMode] = useState<ViewMode>('map');

  const { data: network, isLoading: networkLoading } = useQuery({
    queryKey: ['network', networkId],
    queryFn: () => networksApi.getById(networkId!),
    enabled: !!networkId,
  });

  const { data: devices = [], isLoading: devicesLoading, refetch: refetchDevices } = useQuery({
    queryKey: ['devices', networkId],
    queryFn: () => devicesApi.getByNetwork(networkId!),
    enabled: !!networkId,
    refetchInterval: 5000, // Poll every 5 seconds for updates
  });

  const isLoading = networkLoading || devicesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!network) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Network not found</div>
      </div>
    );
  }

  const baseStations = devices.filter(d => d.deviceType === 'BASE_STATION');
  const fieldUnits = devices.filter(d => d.deviceType === 'FIELD_UNIT');

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{network.name}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {baseStations.length} Base Station(s) • {fieldUnits.length} Field Unit(s)
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {/* View Toggle */}
            <div className="inline-flex rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => setViewMode('map')}
                className={`px-4 py-2 text-sm font-medium rounded-l-lg transition-colors ${
                  viewMode === 'map'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Map View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 text-sm font-medium rounded-r-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                List View
              </button>
            </div>

            <button
              onClick={() => refetchDevices()}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'map' ? (
          <MapView devices={devices} network={network} />
        ) : (
          <ListView devices={devices} network={network} />
        )}
      </div>
    </div>
  );
};

export default Dashboard;
