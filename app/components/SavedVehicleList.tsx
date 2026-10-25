'use client';

import { Barcode, Car, Check, Plus, Trash2 } from 'lucide-react';

type Props = {
  kind: 'car' | 'vin';
  rows: readonly string[];
  selected: string | null;
  loading?: boolean;
  onSelect: (value: string) => void;
  onRemove: (value: string) => void;
  onAdd: () => void;
};

export default function SavedVehicleList({ kind, rows, selected, loading = false, onSelect, onRemove, onAdd }: Props) {
  const isVin = kind === 'vin';
  const Icon = isVin ? Barcode : Car;
  const title = isVin ? 'VIN-коди' : 'Ваші авто';
  return (
    <section className="saved-vehicle-panel" data-kind={kind} aria-label={title}>
      <header className="saved-vehicle-header">
        <span className="saved-vehicle-heading">
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{title}</span>
          {rows.length > 0 && <span className="saved-vehicle-count">{rows.length}</span>}
        </span>
        <button type="button" className="saved-vehicle-add" onClick={onAdd}>
          <Plus size={15} aria-hidden="true" />
          {isVin ? 'Додати VIN' : 'Додати авто'}
        </button>
      </header>
      {loading ? (
        <p className="saved-vehicle-empty" role="status">Завантажуємо VIN-коди…</p>
      ) : rows.length === 0 ? (
        <p className="saved-vehicle-empty">{isVin ? 'Додайте VIN для підбору за кодом авто' : 'Збережіть авто для наступного підбору'}</p>
      ) : (
        <ul className="saved-vehicle-list">
          {rows.map(value => {
            const active = value === selected;
            return (
              <li key={value} className="saved-vehicle-row" data-selected={active ? 'true' : undefined}>
                <button type="button" className="saved-vehicle-select" aria-pressed={active} onClick={() => onSelect(value)}>
                  <span className="saved-vehicle-value">{value}</span>
                  {active && <span className="saved-vehicle-selected"><Check size={14} aria-hidden="true" /><span>Обрано</span></span>}
                </button>
                <button type="button" className="saved-vehicle-remove" aria-label={`Видалити ${isVin ? 'VIN ' : ''}${value}`} onClick={() => onRemove(value)}>
                  <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
