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
