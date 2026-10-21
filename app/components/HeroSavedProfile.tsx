"use client";

import { Car, ChevronRight, IdCard, Trash2, Truck } from "lucide-react";

type HeroSavedProfileProps = {
  profile: {
    cars: string[];
    vins: string[];
    selectionLabel: string | null;
    delivery: { method: string; detail: string | null } | null;
  };
  onOpenCatalogForCars: () => void;
  onOpenDeliverySettings: () => void;
  onOpenVins: () => void;
  onDeleteCar: (label: string) => Promise<void>;
  onDeleteVin: (vin: string) => Promise<void>;
};

// One row per kind (car, VIN, delivery) so the three always fit the fixed
// 128px account area with no inner scroll: the first car and VIN are shown,
// the rest are a "+N" that opens where they are managed.
export default function HeroSavedProfile({
  profile, onOpenCatalogForCars, onOpenDeliverySettings, onOpenVins, onDeleteCar, onDeleteVin,
}: HeroSavedProfileProps) {
  const car = profile.cars.find((label) => label === profile.selectionLabel) ?? profile.cars[0];
  const vin = profile.vins[0];
  return (
    <ul className="hero-profile-list" aria-label="Збережені дані профілю">
      {car && (
        <li className="hero-profile-row" data-active={profile.selectionLabel === car}>
          <button type="button" onClick={onOpenCatalogForCars} className="hero-profile-row-main" aria-label={`Авто ${car}: відкрити каталог`}>
            <Car size={15} aria-hidden="true" />
            <span className="hero-profile-row-kind">Авто</span>
            <span className="hero-profile-row-value" title={car}>{car}</span>
            {profile.cars.length > 1 && <span className="hero-profile-row-more">+{profile.cars.length - 1}</span>}
          </button>
          <button type="button" onClick={() => void onDeleteCar(car)} className="hero-profile-delete" aria-label={`Видалити авто ${car}`}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </li>
      )}
      {vin && (
        <li className="hero-profile-row">
          <button type="button" onClick={onOpenVins} className="hero-profile-row-main" aria-label={`VIN ${vin}: керувати VIN-кодами`}>
            <IdCard size={15} aria-hidden="true" />
            <span className="hero-profile-row-kind">VIN</span>
            <span className="hero-profile-row-value hero-profile-vin" title={vin}>{vin}</span>
            {profile.vins.length > 1 && <span className="hero-profile-row-more">+{profile.vins.length - 1}</span>}
          </button>
          <button type="button" onClick={() => void onDeleteVin(vin)} className="hero-profile-delete" aria-label={`Видалити VIN ${vin}`}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </li>
      )}
      {profile.delivery && (
        <li className="hero-profile-row">
          <button type="button" onClick={onOpenDeliverySettings} className="hero-profile-row-main" aria-label="Змінити спосіб доставки">
            <Truck size={15} aria-hidden="true" />
            <span className="hero-profile-row-kind">Доставка</span>
            <span className="hero-profile-row-value" title={[profile.delivery.method, profile.delivery.detail].filter(Boolean).join(" · ")}>
              {profile.delivery.method}
              {profile.delivery.detail && <span className="hero-profile-row-detail"> · {profile.delivery.detail}</span>}
            </span>
            <ChevronRight size={15} className="hero-profile-row-chevron" aria-hidden="true" />
          </button>
        </li>
      )}
    </ul>
  );
}
