import { splitProductFitmentLine } from './product-fitment-format';
import { brandAtStart } from './vehicle-fitment';
import { normalizeEngineVolume, normalizeVehicleYear } from './vehicle-values';

export type FitmentRow = {
  brand: string; model: string; yearFrom: string; yearTo: string; volume: string;
  originalPeriod?: string; originalYearFrom?: string; originalYearTo?: string;
};
export const emptyFitmentRow = (): FitmentRow => ({ brand: '', model: '', yearFrom: '', yearTo: '', volume: '' });
const year = (v: string) => v.length === 2 ? String(Number(v) >= 40 ? 1900 + Number(v) : 2000 + Number(v)) : v;
export function readFitmentPeriod(period: string): { from: string; to: string } {
  const match = period.match(/^(?:(?:\d{2}\.)?(\d{4}|\d{2}))?-(?:(?:\d{2}\.)?(\d{4}|\d{2}))?$/);
  return match ? { from: match[1] ? year(match[1]) : '', to: match[2] ? year(match[2]) : '' } : { from: '', to: '' };
}
export function readFitmentRows(description: string): FitmentRow[] {
  const firstLine = description.replace(/\r\n?/g, '\n').split('\n')[0] || '';
  const parsed = splitProductFitmentLine(firstLine);
  return parsed?.groups.flatMap(group => {
    const period = readFitmentPeriod(group.period);
    return group.models.map(model => ({ brand: group.brand, model, yearFrom: period.from, yearTo: period.to,
      volume: group.volume, originalPeriod: group.period, originalYearFrom: period.from, originalYearTo: period.to }));
  }) ?? [];
}
export function fitmentRowError(row: FitmentRow): string | null {
  if (!row.brand.trim() || !brandAtStart.test(`${row.brand.trim()} `)) return 'Оберіть марку автомобіля.';
  if (!row.model.trim() || /[;\n\t]/.test(row.model)) return 'Вкажіть одну модель без крапки з комою.';
  if ((row.yearFrom && !normalizeVehicleYear(row.yearFrom)) || (row.yearTo && !normalizeVehicleYear(row.yearTo))) return 'Рік має бути цілим числом від 1900 до 2100.';
  if (row.yearFrom && row.yearTo && Number(row.yearFrom) > Number(row.yearTo)) return 'Рік «від» не може бути пізнішим за рік «до».';
  if (row.volume && !normalizeFitmentVolume(row.volume)) return 'Вкажіть об’єм у літрах, наприклад 1.6 або 1.6–2.0.';
  return null;
}
export function normalizeFitmentVolume(raw: string): string | null {
  if (!raw.trim()) return '';
  const normalized = raw.trim().replace(/[–—−]/g, '-');
  // Preserve fuel/engine suffixes already present in 1C descriptions.
  if (/[A-Z/]/i.test(normalized) && /^\d{1,2}[.,]\d[A-Z]{0,3}(?:[-/]\d{1,2}[.,]\d[A-Z]{0,3})*(?:-Electric)?$/i.test(normalized)) return normalized.replace(/,/g, '.');
  const parts = normalized.split('-');
  if (parts.length > 2) return null;
  const from = parts[0] ? normalizeEngineVolume(parts[0]) : '';
  const to = parts.length === 2 && parts[1] ? normalizeEngineVolume(parts[1]) : '';
  if (!from && !to || parts[0] && !from || parts[1] && !to) return null;
  if (from && to && Number(from) > Number(to)) return null;
  return parts.length === 2 ? `${from}-${to}` : from;
}
const shortYear = (value: string) => Number(value) >= 1940 && Number(value) <= 2039 ? value.slice(-2) : value;
export function writeFitmentRows(description: string, rows: FitmentRow[]): string {
  const invalid = rows.map(fitmentRowError).find(Boolean);
  if (invalid) throw new Error(invalid);
  const lines = description.replace(/\r\n?/g, '\n').split('\n');
  const parsed = splitProductFitmentLine(lines[0] || '');
  const fitment = rows.map(row => {
    let period = row.originalPeriod && row.yearFrom === row.originalYearFrom && row.yearTo === row.originalYearTo ? row.originalPeriod : '';
    if (!period && (row.yearFrom || row.yearTo)) period = `${row.yearFrom ? `01.${shortYear(row.yearFrom)}` : ''}-${row.yearTo ? `12.${shortYear(row.yearTo)}` : ''}`;
    return [row.brand.trim().toUpperCase(), row.model.trim(), normalizeFitmentVolume(row.volume), period].filter(Boolean).join(' ');
  }).join('; ');
  if (parsed) {
    if (fitment) lines[0] = [parsed.prefix, fitment].filter(Boolean).join(' ');
    else if (parsed.prefix) lines[0] = parsed.prefix;
    else lines.shift();
  } else if (fitment) lines.unshift(fitment);
  const result = lines.join('\n');
  if (result.length > 10000) throw new Error('Опис із сумісністю перевищує 10 000 символів.');
  return result;
}
