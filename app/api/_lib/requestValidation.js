export async function readJsonObject(req, { maxBytes = 32_000 } = {}) {
  const raw = await req.text();
  if (!raw) {
    return { ok: true, value: {} };
  }

  if (raw.length > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Payload too large. Max ${maxBytes} bytes`,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        status: 400,
        error: "Invalid JSON body: object expected",
      };
    }

    return { ok: true, value: parsed };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}

export function isNonEmptyString(value, { maxLength = 200 } = {}) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export function asPositiveNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
