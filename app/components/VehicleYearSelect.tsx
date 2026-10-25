"use client";

import { useId } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

export default function VehicleYearSelect({ value, years, loading = false, allowAny = true, onChange }: {
  value: number | null;
  years: readonly number[];
  loading?: boolean;
  allowAny?: boolean;
  onChange: (year: number | null) => void;
}) {
  const id = useId();
  const options = [...new Set(years.filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100))].sort((a, b) => b - a);
  const selectedAvailable = value == null || options.includes(value);
  return (
    <div className="vehicle-year-field">
      <div className="vehicle-year-copy">
        <label htmlFor={id}>Рік випуску</label>
        <p id={`${id}-hint`}>Уточніть рік вашого авто</p>
      </div>
      <div className="vehicle-year-control">
        <CalendarDays className="vehicle-year-icon" size={18} strokeWidth={1.8} aria-hidden="true" />
        <select aria-describedby={`${id}-hint`} id={id} value={value ?? ""} disabled={loading || options.length === 0} aria-busy={loading} onChange={event => onChange(event.target.value ? Number(event.target.value) : null)}>
          <option value="">{loading ? "Завантаження…" : options.length ? (allowAny ? "Усі роки" : "Оберіть рік") : "Роки недоступні"}</option>
          {!selectedAvailable && <option value={value!} disabled>{value}</option>}
          {options.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
        <ChevronDown className="vehicle-year-chevron" size={16} strokeWidth={2} aria-hidden="true" />
      </div>
    </div>
  );
}
