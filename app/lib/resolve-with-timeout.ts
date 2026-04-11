import "server-only";

export async function resolveWithTimeout<T>(
  loader: () => Promise<T>,
  fallback: T,
  timeoutMs = 2500
): Promise<T> {
  try {
    const timeoutResult = { timedOut: true } as const;
    const result = await Promise.race<T | typeof timeoutResult>([
      loader(),
      new Promise<typeof timeoutResult>((resolve) => {
        setTimeout(() => resolve(timeoutResult), timeoutMs);
      }),
    ]);

    if (result === timeoutResult) {
      return fallback;
    }

    return result as T;
  } catch {
    return fallback;
  }
}
