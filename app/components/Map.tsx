'use client';

import { FC, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const storePosition: [number, number] = [49.8140625, 23.9891875];

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [0, -40],
  shadowSize: [15, 25],
});

const MapComponent: FC = () => {
  useEffect(() => {
    const id = 'leaflet-stylesheet-cdn';

    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);

  return (
    <MapContainer
      center={storePosition}
      zoom={15}
      scrollWheelZoom
      className="h-full w-full rounded-xl shadow-xl z-0"
    >
      <TileLayer
        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        attribution="Google Maps"
      />

      <Marker position={storePosition} icon={customIcon}>
        <Popup>PartsON, RX7Q+JM, Львів</Popup>
      </Marker>
    </MapContainer>
  );
};

export default MapComponent;
