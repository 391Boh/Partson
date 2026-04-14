type NonEmptyStringOptions = {
  minLength?: number;
  maxLength?: number;
};

type ReadJsonObjectSuccess = {
  ok: true;
  value: Record<string, unknown>;
};

type ReadJsonObjectFailure = {
  ok: false;
  status: number;
  error: string;
};

type ReadJsonObjectOptions = {
  maxBytes?: number;
};

export const isNonEmptyString = (
  value: unknown,
  options?: NonEmptyStringOptions
) => {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  const minLength = Math.max(0, Math.floor(options?.minLength ?? 1));
  const maxLength = Math.max(
    minLength,
    Math.floor(options?.maxLength ?? Number.MAX_SAFE_INTEGER)
  );

  return trimmed.length >= minLength && trimmed.length <= maxLength;
};

export const readJsonObject = async (
  req: Request,
  options?: ReadJsonObjectOptions
): Promise<ReadJsonObjectSuccess | ReadJsonObjectFailure> => {
  const maxBytes = Math.max(256, Math.floor(options?.maxBytes ?? 16_384));
  const raw = await req.text();

  if (raw.length > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "Payload too large",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid JSON body",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      status: 400,
      error: "JSON body must be an object",
    };
  }

  return {
    ok: true,
    value: parsed as Record<string, unknown>,
  };
};
