import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Device, Network } from '../../types';

interface MapViewProps {
  devices: Device[];
  network: Network;
}

const MapView: React.FC<MapViewProps> = ({ devices }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map
    const map = L.map(mapContainerRef.current).setView([0, 0], 2);
    mapRef.current = map;

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const markers = markersRef.current;

    // Get devices with valid coordinates
    const devicesWithCoords = devices.filter(
      d => d.latitude !== null && d.longitude !== null && d.latitude !== undefined && d.longitude !== undefined
    );

    // Remove markers for devices that no longer exist
    markers.forEach((marker, deviceId) => {
      if (!devices.find(d => d.id === deviceId)) {
        marker.remove();
        markers.delete(deviceId);
      }
    });

    // Update or create markers
    devicesWithCoords.forEach(device => {
      const lat = device.latitude!;
      const lng = device.longitude!;
      const existing = markers.get(device.id);

      // Determine icon color based on status
      let iconColor = 'gray';
      if (device.status === 'ONLINE') iconColor = '#22c55e'; // green
      else if (device.status === 'OFFLINE') iconColor = '#ef4444'; // red
      else if (device.status === 'LOW_BATTERY') iconColor = '#eab308'; // yellow
      else if (device.status === 'DISCOVERED') iconColor = '#3b82f6'; // blue

      const iconHtml = device.deviceType === 'BASE_STATION'
        ? `<div style="background-color: ${iconColor}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`
        : `<div style="background-color: ${iconColor}; width: 16px; height: 16px; border-radius: 3px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`;

      const icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      if (existing) {
        // Update existing marker
        existing.setLatLng([lat, lng]);
        existing.setIcon(icon);
        existing.setPopupContent(getPopupContent(device));
      } else {
        // Create new marker
        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(getPopupContent(device));
        markers.set(device.id, marker);
      }
    });

    // Fit map to bounds if there are devices
    if (devicesWithCoords.length > 0) {
      const bounds = L.latLngBounds(
        devicesWithCoords.map(d => [d.latitude!, d.longitude!])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [devices]);

  const getPopupContent = (device: Device): string => {
    return `
      <div class="p-2">
        <h3 class="font-bold text-sm">${device.name || device.boardId}</h3>
        <p class="text-xs text-gray-600">${device.deviceType}</p>
        <p class="text-xs mt-1">Status: <span class="font-medium">${device.status}</span></p>
        ${device.batteryPercent !== null && device.batteryPercent !== undefined
          ? `<p class="text-xs">Battery: ${device.batteryPercent}%</p>`
          : ''
        }
        ${device.lastSeen
          ? `<p class="text-xs">Last Seen: ${new Date(device.lastSeen).toLocaleString()}</p>`
          : ''
        }
      </div>
    `;
  };

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-[1000]">
        <h4 className="font-semibold text-sm mb-2">Legend</h4>
        <div className="space-y-2 text-xs">
          <div className="flex items-center">
            <div className="w-5 h-5 rounded-full bg-green-500 mr-2"></div>
            <span>Online</span>
          </div>
          <div className="flex items-center">
            <div className="w-5 h-5 rounded-full bg-red-500 mr-2"></div>
            <span>Offline</span>
          </div>
          <div className="flex items-center">
            <div className="w-5 h-5 rounded-full bg-yellow-500 mr-2"></div>
            <span>Low Battery</span>
          </div>
          <div className="flex items-center">
            <div className="w-5 h-5 rounded-full bg-blue-500 mr-2"></div>
            <span>Discovered</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
