// Read-only pagination contract check. Never prints configuration or credentials.
import { oneCRequest } from "../app/api/_lib/oneC.js";
for (const [endpoint, extra] of [
  ["allgoods", {}],
  ["allgoods", { НомерСтраницы: 2, page: 2, Смещение: 3, offset: 3 }],
  ["getdata", {}],
  ["getdata", { НомерСтраницы: 2, page: 2, Смещение: 3, offset: 3 }],
]) {
  const started = Date.now();
  const result = await oneCRequest(endpoint, {
    method: "POST", body: { Лимит: 3, limit: 3, ВключатьФотоBase64: false, ...extra },
    timeoutMs: 8000, retries: 0, cacheTtlMs: 0,
  });
  let payload;
  try { payload = JSON.parse(result.text); } catch { payload = {}; }
  const items = Array.isArray(payload) ? payload : payload.items || [];
  console.log(JSON.stringify({ endpoint, page: extra.page || 1, status: result.status,
    ms: Date.now() - started, total: payload.total_count, keys: Object.keys(payload).slice(0, 12),
    codes: items.slice(0, 4).map((p) => p.Код || p.НоменклатураКод || p.code) }));
}
