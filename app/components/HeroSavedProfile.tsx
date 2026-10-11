"use client";

import { Car, ChevronRight, Trash2, Truck } from "lucide-react";

type HeroSavedProfileProps = {
  profile: {
    cars: string[];
    vins: string[];
    selectionLabel: string | null;
    delivery: { method: string; detail: string | null } | null;
  };
  onOpenCatalogForCars: () => void;
  onOpenDeliverySettings: () => void;
  onDeleteCar: (label: string) => Promise<void>;
  onDeleteVin: (vin: string) => Promise<void>;
};

export default function HeroSavedProfile({
  profile, onOpenCatalogForCars, onOpenDeliverySettings, onDeleteCar, onDeleteVin,
}: HeroSavedProfileProps) {
  return (
    <div className="hero-profile-list">
      {profile.cars.length > 0 && (
        <section aria-label="Збережені автомобілі" className="hero-profile-section">
          <h3 className="hero-profile-label">Ваші автомобілі</h3>
          <ul className="hero-profile-items">
            {profile.cars.map((label) => (
              <li key={label} className="hero-profile-item" data-active={profile.selectionLabel === label}>
                <button type="button" onClick={onOpenCatalogForCars} className="hero-profile-car" aria-label={`Відкрити каталог для ${label}`}>
                  <Car size={16} aria-hidden="true" />
                  <span>{label}</span>
                </button>
                <button type="button" onClick={() => void onDeleteCar(label)} className="hero-profile-delete" aria-label={`Видалити авто ${label}`}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {profile.vins.length > 0 && (
        <section aria-label="Збережені VIN-коди" className="hero-profile-section">
          <h3 className="hero-profile-label">VIN-коди</h3>
          <ul className="hero-profile-items">
            {profile.vins.map((vin) => (
              <li key={vin} className="hero-profile-item">
                <span className="hero-profile-vin">{vin}</span>
                <button type="button" onClick={() => void onDeleteVin(vin)} className="hero-profile-delete" aria-label={`Видалити VIN ${vin}`}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {profile.delivery && (
        <section aria-label="Збережена доставка" className="hero-profile-section">
          <h3 className="hero-profile-label">Доставка</h3>
          <button type="button" onClick={onOpenDeliverySettings} className="hero-profile-delivery" aria-label="Змінити спосіб доставки">
            <Truck size={17} aria-hidden="true" />
            <span><strong>{profile.delivery.method}</strong>{profile.delivery.detail && <span>{profile.delivery.detail}</span>}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}
    </div>
  );
}
