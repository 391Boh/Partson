'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FC } from 'react';

// Координати: Львів, вул. Перфецького, 2
const storePosition: [number, number] = [49.814157, 23.988981];

// Кастомна іконка з CDN
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [0, -40],
  shadowSize: [45, 45],
});

const MapComponent: FC = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // This will ensure the map is only rendered after the component mounts on the client
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <div>Loading...</div>; // Show loading message or spinner while the map is loading
  }

  return (
    <div style={{ width: '100%', height: '35vh' }}>
      <MapContainer
        center={storePosition}
        zoom={15}
        scrollWheelZoom={false}
        className="w-full h-full rounded-xl shadow-xl z-0"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <Marker position={storePosition} icon={customIcon}>
          <Popup>📍 Львів, вул. Перфецького, 2</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default MapComponent;
