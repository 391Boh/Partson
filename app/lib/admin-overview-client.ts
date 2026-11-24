import { getAdminIdToken } from "./get-admin-token";

export async function overviewFetch(url: string, init?: RequestInit) {
  const token = await getAdminIdToken();
  if (!token) throw new Error("Увійдіть як адміністратор.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers, cache: "no-store" });
}

export async function overviewJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await overviewFetch(url, init);
  const data = await response.json().catch(() => ({})) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) throw new Error(data.error || "Не вдалося завантажити дані.");
  return data;
}

export const analyticsMoney = (value: number) => `${Math.round(value).toLocaleString("uk-UA")} грн`;
export const analyticsDate = (day: string) => new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00Z`));
export function analyticsChange(current: number, previous: number) {
  if (!previous) return current ? "Раніше — 0" : "Без змін";
  const delta = (current - previous) / previous * 100;
  if (Math.abs(delta) < .05) return "Без змін";
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString("uk-UA", { maximumFractionDigits: 1 })}%`;
}
