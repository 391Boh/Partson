'use client';

import { FC } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Координати plus code: RX7Q+JM, Львів, Львівська область
const storePosition: [number, number] = [49.8140625, 23.9891875];


// Кастомна іконка з CDN
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [0, -40],
  shadowSize: [15, 25],
});

const MapComponent: FC = () => {
  return (
    // НІЯКОГО inline style з 35vh
    // Карта просто займає 100% розміру зовнішнього контейнера
    <MapContainer
      center={storePosition}
      zoom={15}
      scrollWheelZoom={true}
      className="w-full h-full rounded-xl shadow-xl z-0"
    >
    <TileLayer
  url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
  attribution="Google Maps"
/>

      <Marker position={storePosition} icon={customIcon}>
        <Popup>📍 PartsON, RX7Q+JM, Львів</Popup>
      </Marker>
    </MapContainer>
  );
};

export default MapComponent;
