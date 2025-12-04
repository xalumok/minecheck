import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Device, Network } from '../../types';

interface MapViewProps {
  devices: Device[];
  network: Network;
}

const statusColorMap: Record<Device['status'], string> = {
  ONLINE: '#16a34a',
  OFFLINE: '#ef4444',
  LOW_BATTERY: '#f59e0b',
  DISCOVERED: '#3b82f6',
};

const statusLegendItems = [
  { label: 'Online', color: statusColorMap.ONLINE },
  { label: 'Offline', color: statusColorMap.OFFLINE },
  { label: 'Low Battery', color: statusColorMap.LOW_BATTERY },
  { label: 'Discovered', color: statusColorMap.DISCOVERED },
];

const StatusLegendDot: React.FC<{ color: string }> = ({ color }) => (
  <div
    className="mr-2 h-5 w-5 rounded-full border border-white shadow"
    style={{ backgroundColor: color }}
  />
);

const TypeLegendIcon: React.FC<{ type: Device['deviceType'] }> = ({ type }) => {
  const isBase = type === 'BASE_STATION';
  const size = isBase ? 28 : 24;
  const demoColor = '#16a34a'; // Green for demo

  return (
    <div className="mr-2 flex items-center justify-center" style={{ width: '32px', height: '32px' }}>
      <div style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.25))',
      }}>
        <div style={{
          width: `${size}px`,
          height: `${size}px`,
          background: `linear-gradient(145deg, ${demoColor}, ${demoColor}dd)`,
          border: '3px solid rgba(255,255,255,0.95)',
          borderRadius: isBase ? '50%' : '6px',
          transform: isBase ? 'none' : 'rotate(45deg)',
          boxShadow: 'inset 0 0 8px rgba(255,255,255,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            color: 'white',
            fontWeight: '800',
            fontSize: '7px',
            letterSpacing: '0.3px',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            transform: isBase ? 'none' : 'rotate(-45deg)',
          }}>
            {isBase ? 'BASE' : 'ATMG'}
          </span>
        </div>
        {isBase && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: `${size - 12}px`,
            height: `${size - 12}px`,
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }} />
        )}
      </div>
    </div>
  );
};

const MapView: React.FC<MapViewProps> = ({ devices }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const baseLayersRef = useRef<{ [key: string]: L.TileLayer }>({});
  const [activeLayer, setActiveLayer] = React.useState<'street' | 'satellite' | 'hybrid'>('street');

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    console.log('🗺️ Initializing map...');

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      center: [48.9155, 37.8009],
      zoom: 13,
      zoomControl: true,
    });
    
    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);

    // Define tile layers
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 100,
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri',
      maxZoom: 100,
    });

    const hybridLayer = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri',
        maxZoom: 100,
      }),
      L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-hybrid/{z}/{x}/{y}.png', {
        attribution: 'Map tiles by Stamen Design, under CC BY 3.0',
        maxZoom: 100,
        opacity: 0.5,
      }),
    ]);

    baseLayersRef.current = {
      street: streetLayer,
      satellite: satelliteLayer as unknown as L.TileLayer,
      hybrid: hybridLayer as unknown as L.TileLayer,
    };

    // Add default layer
    streetLayer.addTo(map);

    // Force resize after initialization
    setTimeout(() => {
      map.invalidateSize();
      console.log('✅ Map initialized and resized');
    }, 100);

    return () => {
      console.log('🧹 Cleaning up map');
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Handle layer switching
  const switchLayer = (layerType: 'street' | 'satellite' | 'hybrid') => {
    const map = mapRef.current;
    if (!map) return;

    // Remove current layer
    Object.values(baseLayersRef.current).forEach(layer => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    // Add new layer
    const newLayer = baseLayersRef.current[layerType];
    if (newLayer) {
      newLayer.addTo(map);
      setActiveLayer(layerType);
      console.log(`🗺️ Switched to ${layerType} layer`);
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    
    if (!map || !markersLayer) {
      console.log('⚠️ Map or markers layer not ready');
      return;
    }

    // Clear existing markers
    markersLayer.clearLayers();

    const devicesWithCoords = devices.filter(
      d => d.latitude != null && d.longitude != null
    );

    console.log('📍 Adding markers for devices:', devicesWithCoords);

    devicesWithCoords.forEach(device => {
      const color = statusColorMap[device.status] ?? '#94a3b8';
      const isBase = device.deviceType === 'BASE_STATION';
      const size = isBase ? 56 : 44;
      const label = isBase ? 'BASE' : 'ATMG';
      
      // Create styled marker with gradient and label
      const icon = L.divIcon({
        html: `
          <div style="
            position: relative;
            width: ${size}px;
            height: ${size}px;
            filter: drop-shadow(0 6px 16px rgba(0,0,0,0.35));
          ">
            <div style="
              width: ${size}px;
              height: ${size}px;
              background: linear-gradient(145deg, ${color}, ${color}dd);
              border: 5px solid rgba(255,255,255,0.95);
              border-radius: ${isBase ? '50%' : '12px'};
              ${!isBase ? 'transform: rotate(45deg);' : ''}
              box-shadow: inset 0 0 12px rgba(255,255,255,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <span style="
                color: white;
                font-weight: 800;
                font-size: ${isBase ? '11px' : '10px'};
                letter-spacing: 0.5px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.6);
                ${!isBase ? 'transform: rotate(-45deg);' : ''}
              ">${label}</span>
            </div>
            ${isBase ? `
              <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: ${size - 20}px;
                height: ${size - 20}px;
                border: 2px solid rgba(255,255,255,0.4);
                border-radius: 50%;
                pointer-events: none;
              "></div>
            ` : ''}
          </div>
        `,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      });

      const marker = L.marker([device.latitude!, device.longitude!], { 
        icon,
        zIndexOffset: isBase ? 1000 : 800,
      })
        .bindPopup(`
          <div style="padding: 8px; min-width: 180px;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 6px; color: #1f2937;">
              ${device.name || device.boardId}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
              <strong>Type:</strong> ${device.deviceType === 'BASE_STATION' ? 'Base Station' : 'Field Unit'}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
              <strong>Status:</strong> <span style="color: ${color}; font-weight: 600;">${device.status}</span>
            </div>
            ${device.batteryPercent != null ? `
              <div style="font-size: 12px; color: #6b7280;">
                <strong>Battery:</strong> ${device.batteryPercent}%
              </div>
            ` : ''}
          </div>
        `);

      markersLayer.addLayer(marker);
      console.log(`✅ Added marker for ${device.name} at [${device.latitude}, ${device.longitude}]`);
    });

    // Fit bounds to show all markers
    if (devicesWithCoords.length > 0) {
      const bounds = L.latLngBounds(
        devicesWithCoords.map(d => [d.latitude!, d.longitude!])
      );
      map.fitBounds(bounds, { padding: [100, 100], maxZoom: 16 });
      console.log('🎯 Fitted bounds to markers');
    }
  }, [devices]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      
      {/* Map Layer Switcher */}
      <div className="absolute top-4 right-4 flex gap-2 z-[1000]">
        <button
          onClick={() => switchLayer('street')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg shadow-lg transition-all ${
            activeLayer === 'street'
              ? 'bg-blue-600 text-white'
              : 'bg-white/95 text-gray-700 hover:bg-white'
          }`}
          title="Street Map"
        >
          🗺️ Street
        </button>
        <button
          onClick={() => switchLayer('satellite')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg shadow-lg transition-all ${
            activeLayer === 'satellite'
              ? 'bg-blue-600 text-white'
              : 'bg-white/95 text-gray-700 hover:bg-white'
          }`}
          title="Satellite Imagery"
        >
          🛰️ Satellite
        </button>
        <button
          onClick={() => switchLayer('hybrid')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg shadow-lg transition-all ${
            activeLayer === 'hybrid'
              ? 'bg-blue-600 text-white'
              : 'bg-white/95 text-gray-700 hover:bg-white'
          }`}
          title="Hybrid View"
        >
          🌍 Hybrid
        </button>
      </div>

      <div className="absolute bottom-4 left-4 w-64 rounded-xl bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 z-[1000]">
        <h4 className="text-sm font-semibold text-gray-800">Map Legend</h4>
        <div className="mt-3 space-y-4 text-xs text-gray-700">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-500">Device Types</p>
            <div className="mt-2 space-y-2">
              <div className="flex items-start">
                <TypeLegendIcon type="BASE_STATION" />
                <div>
                  <p className="font-medium text-gray-800">Base Station</p>
                  <p className="text-[0.65rem] text-gray-500">Circle with "BASE" label</p>
                </div>
              </div>
              <div className="flex items-start">
                <TypeLegendIcon type="FIELD_UNIT" />
                <div>
                  <p className="font-medium text-gray-800">ATmega Field Unit</p>
                  <p className="text-[0.65rem] text-gray-500">Diamond with "ATMG" label</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-500">Status Colors</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {statusLegendItems.map(item => (
                <div key={item.label} className="flex items-center">
                  <StatusLegendDot color={item.color} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
