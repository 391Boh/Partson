"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { carBrands } from "./carBrands";
import { emptyFitmentRow, fitmentRowError, readFitmentRows, writeFitmentRows, type FitmentRow } from "app/lib/product-fitment-editor";

type Props = { value: string; onChange: (value: string) => void; onValidityChange: (valid: boolean) => void; disabled?: boolean };
export default function ProductFitmentEditor({ value, onChange, onValidityChange, disabled = false }: Props) {
  const [rows, setRows] = useState(() => readFitmentRows(value));
  const [bulk, setBulk] = useState({ yearFrom: '', yearTo: '', volume: '' });
  const [error, setError] = useState('');
  const lastWritten = useRef(value);
  const id = useId();
  const modelWord = rows.length % 100 >= 11 && rows.length % 100 <= 14 ? "моделей" : rows.length % 10 === 1 ? "модель" : rows.length % 10 >= 2 && rows.length % 10 <= 4 ? "моделі" : "моделей";

  useEffect(() => {
    onValidityChange(true);
    return () => onValidityChange(true);
  }, [onValidityChange]);

  useEffect(() => {
    if (value === lastWritten.current) return;
    lastWritten.current = value;
    setRows(readFitmentRows(value));
    setError('');
    onValidityChange(true);
  }, [value, onValidityChange]);

  const commit = (next: FitmentRow[]) => {
    setRows(next);
    const invalid = next.map(fitmentRowError).find(Boolean);
    if (invalid) { setError(invalid); onValidityChange(false); return; }
    try {
      const description = writeFitmentRows(value, next);
      lastWritten.current = description;
      setError('');
      onValidityChange(true);
      onChange(description);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Перевірте налаштування сумісності.');
      onValidityChange(false);
    }
  };
  const patch = (index: number, key: keyof FitmentRow, value: string) => commit(rows.map((row, i) => i === index ? { ...row, [key]: value } : row));

  return (
    <details className="product-fitment-editor">
      <summary>Сумісність з автомобілями <span>{rows.length ? `${rows.length} ${modelWord}` : 'Додати авто'}</span></summary>
      <fieldset disabled={disabled} aria-describedby={`${id}-help`}>
        <p id={`${id}-help`}>Для кожної моделі вкажіть роки та об’єм двигуна. Порожня межа означає, що обмеження не задане. Зміни зберігаються разом з описом товару.</p>
        {rows.map((row, index) => (
          <div key={index} className="product-fitment-row" role="group" aria-label={`Сумісність ${index + 1}`}>
            <label>Марка<select aria-label={`Марка ${index + 1}`} value={row.brand} onChange={e => patch(index, 'brand', e.target.value)}>
              <option value="">Оберіть марку</option>
              {row.brand && !carBrands.some(b => b.name === row.brand) && <option value={row.brand}>{row.brand}</option>}
              {carBrands.map(brand => <option key={brand.id} value={brand.name}>{brand.name}</option>)}
            </select></label>
            <label className="product-fitment-model">Модель<input aria-label={`Модель ${index + 1}`} value={row.model} onChange={e => patch(index, 'model', e.target.value)} placeholder="Наприклад, Passat B6" maxLength={160} /></label>
            <label>Рік від<input aria-label={`Рік від ${index + 1}`} inputMode="numeric" value={row.yearFrom} onChange={e => patch(index, 'yearFrom', e.target.value)} placeholder="Не задано" maxLength={4} /></label>
            <label>Рік до<input aria-label={`Рік до ${index + 1}`} inputMode="numeric" value={row.yearTo} onChange={e => patch(index, 'yearTo', e.target.value)} placeholder="Без межі" maxLength={4} /></label>
            <label>Об’єм, л<input aria-label={`Об’єм двигуна ${index + 1}`} value={row.volume} onChange={e => patch(index, 'volume', e.target.value)} placeholder="1.6 або 1.6–2.0" maxLength={40} /></label>
            <button type="button" className="product-fitment-remove" aria-label={`Видалити сумісність ${index + 1}`} onClick={() => commit(rows.filter((_, i) => i !== index))}><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        ))}
        <button type="button" className="product-fitment-action" onClick={() => commit([...rows, emptyFitmentRow()])}><Plus size={15} aria-hidden="true" />Додати модель</button>
        {rows.length > 1 && <details className="product-fitment-bulk">
          <summary>Заповнити для всіх моделей у списку</summary>
          <div className="product-fitment-bulk-fields">
            <label>Рік від<input aria-label="Спільний рік від" inputMode="numeric" value={bulk.yearFrom} onChange={e => setBulk({ ...bulk, yearFrom: e.target.value })} maxLength={4} /></label>
            <label>Рік до<input aria-label="Спільний рік до" inputMode="numeric" value={bulk.yearTo} onChange={e => setBulk({ ...bulk, yearTo: e.target.value })} maxLength={4} /></label>
            <label>Об’єм, л<input aria-label="Спільний об’єм двигуна" value={bulk.volume} onChange={e => setBulk({ ...bulk, volume: e.target.value })} maxLength={40} /></label>
            <button type="button" className="product-fitment-action" disabled={!bulk.yearFrom && !bulk.yearTo && !bulk.volume} onClick={() => commit(rows.map(row => ({ ...row, ...(bulk.yearFrom ? { yearFrom: bulk.yearFrom } : {}), ...(bulk.yearTo ? { yearTo: bulk.yearTo } : {}), ...(bulk.volume ? { volume: bulk.volume } : {}) })))}>Застосувати до всіх</button>
          </div>
          <p>Порожні поля залишають поточні значення. Застосовуйте лише підтверджену сумісність.</p>
        </details>}
        {error && <p className="product-fitment-error" role="alert">{error}</p>}
      </fieldset>
    </details>
  );
}
