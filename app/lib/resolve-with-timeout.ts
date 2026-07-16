import "server-only";

export async function resolveWithTimeout<T>(
  loader: () => Promise<T>,
  fallback: T,
  timeoutMs = 2500
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutResult = { timedOut: true } as const;
    const result = await Promise.race<T | typeof timeoutResult>([
      loader(),
      new Promise<typeof timeoutResult>((resolve) => {
        timeoutId = setTimeout(() => resolve(timeoutResult), timeoutMs);
      }),
    ]);

    if (result === timeoutResult) {
      return fallback;
    }

    return result as T;
  } catch {
    return fallback;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
