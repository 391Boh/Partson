export const isNovaPoshtaDelivery = (method: unknown) =>
  typeof method === "string" && /^нова\s+пошта$/iu.test(method.trim());

export const normalizeTrackingNumber = (value: string) => value.replace(/\s/g, "");
export const isValidTrackingNumber = (value: string) => /^\d{14}$/.test(value);
export const getNovaPoshtaTrackingUrl = (value: string) =>
  isValidTrackingNumber(value)
    ? `https://tracking.novaposhta.ua/#/uk/?search=${encodeURIComponent(value)}`
    : null;
