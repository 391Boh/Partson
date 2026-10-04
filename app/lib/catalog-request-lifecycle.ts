// DOMException need not inherit from this realm's Error (Safari/iframes).
export const isAbortLikeError = (error: unknown): boolean => {
  if (!error || (typeof error !== "object" && typeof error !== "string")) return false;
  const value = error as { name?: unknown; message?: unknown };
  if (value.name === "AbortError") return true;
  const message = typeof error === "string" ? error : typeof value.message === "string" ? value.message : "";
  return /signal is aborted|aborted without reason|fetch is aborted|operation was aborted/i.test(message);
};

export const createAbortError = () => {
  const error = new Error("Request cancelled");
  error.name = "AbortError";
  return error;
};

export const handleCatalogBackgroundError = (error: unknown) => {
  // Detached prefetch has no caller to catch another rejection. Foreground
  // callers still receive the original rejection and display a retry message.
  if (!isAbortLikeError(error)) console.warn("Catalog background request failed", error);
};

export const awaitWithAbortSignal = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    // Observe the source even when the caller was cancelled before subscribing.
    promise.then(
      value => { signal.removeEventListener("abort", onAbort); resolve(value); },
      error => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
};

// Attach immediately when starting parallel work, before awaiting a sibling.
// Keep the original rejection for its eventual consumer.
export const observeCatalogRequest = <T>(promise: Promise<T>): Promise<T> => {
  void promise.catch(() => undefined);
  return promise;
};
