/** Shared normalization for 1C, the fitment editor and the public car picker. */
export function normalizeVehicleYear(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
}

export function normalizeEngineVolume(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(л\.?|l|літр(?:и|ів)?|cc|cm[³3]|см[³3])?$/i);
  if (!match) return null;
  let volume = Number(match[1]);
  if (/cc|cm|см/i.test(match[2] || '') || volume >= 100) volume /= 1000;
  if (!(volume > 0 && volume <= 30)) return null;
  return (Math.round(volume * 10) / 10).toFixed(1);
}

export function vehicleYearOptions(startValue: unknown, endValue: unknown, currentYear = new Date().getFullYear()): number[] {
  const start = normalizeVehicleYear(startValue);
  const end = normalizeVehicleYear(endValue) ?? currentYear;
  if (!start || start > end) return [];
  return Array.from({ length: Math.min(end, currentYear + 1) - start + 1 }, (_, i) => start + i);
}

/** Read only named year fields. An engine displacement such as 1998 cm³
 * must never become a model's production year through numeric guessing. */
export function readAutoYearRange(record: Record<string, unknown>): { start: number | null; end: number | null } {
  const fields = Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[\s_-]/g, ''), value] as const);
  const read = (pattern: RegExp) => {
    for (const [key, value] of fields) {
      if (!pattern.test(key)) continue;
      const year = normalizeVehicleYear(value);
      if (year) return year;
    }
    return null;
  };
  const start = read(/yearstart|startyear|рікпочат|годнач|почат|начал/);
  const end = read(/yearend|endyear|ріккінец|годкон|кінец|конец/);
  if (start || end) return { start, end };
  const single = read(/^(year|рік|год|yearofmanufacture|productionyear|ріквипуску|годвыпуска)$/);
  return { start: single, end: single };
}
