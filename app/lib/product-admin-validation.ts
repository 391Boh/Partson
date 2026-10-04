// Shared by every admin inline-edit surface (catalog grid card, catalog list
// row, product detail page) so the same input gets the same validation rule
// and the same error copy everywhere, instead of three hand-rolled checks.

export function parseAdminPriceInput(raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  const value = trimmed ? Number(trimmed.replace(",", ".")) : NaN;
  if (!Number.isFinite(value) || value < 0) return { error: "Введіть коректну ціну" };
  return { value };
}

export function parseAdminQtyInput(raw: string): { value: number } | { error: string } {
  const value = Number(raw.replace(",", "."));
  if (!Number.isSafeInteger(value) || value <= 0) return { error: "Введіть цілу кількість > 0" };
  return { value };
}

// Empty optional prices stay unset; malformed values must never become zero.
export function parseProductFormPrice(raw: string): number | undefined | null {
  const value = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!value) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER / 100 ? number : null;
}

export function parseProductFormQuantity(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
