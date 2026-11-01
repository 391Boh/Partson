import type { User } from "firebase/auth";

export const ADMIN_NOTIFICATIONS_CHANGED_EVENT = "partson:admin-notifications-changed";
const REFRESH_MS = 20_000;

/** Counts only. Collection contents load when the administrator opens a panel. */
export function subscribeAdminNotificationCount(user: User, onCount: (count: number) => void): () => void {
  let stopped = false;
  let running = false;
  let queuedRefresh = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const isVisible = () => document.visibilityState !== "hidden";

  const refresh = async (force = false) => {
    clearTimeout(timer);
    if (stopped || !isVisible()) return;
    if (running) { queuedRefresh ||= force || Boolean(controller?.signal.aborted); return; }
    running = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 10_000);
    try {
      const token = await user.getIdToken();
      if (stopped || controller.signal.aborted) return;
      const response = await fetch(`/api/admin/notification-counts${force ? "?refresh=1" : ""}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
      });
      if (response.status === 403) { if (!stopped) onCount(0); return; }
      if (!response.ok) return;
      const value = await response.json() as { total?: unknown };
      if (!stopped && typeof value.total === "number" && Number.isFinite(value.total) && value.total >= 0) onCount(value.total);
    } catch { /* Keep the last good count through transient network failures. */ }
    finally {
      clearTimeout(timeout);
      running = false;
      if (!stopped && isVisible()) {
        const forceNext = queuedRefresh;
        queuedRefresh = false;
        timer = setTimeout(() => { void refresh(forceNext); }, forceNext ? 200 : REFRESH_MS);
      }
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "hidden") { clearTimeout(timer); controller?.abort(); }
    else void refresh();
  };
  const onChanged = () => { void refresh(true); };
  const onFocus = () => { void refresh(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener(ADMIN_NOTIFICATIONS_CHANGED_EVENT, onChanged);
  void refresh();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener(ADMIN_NOTIFICATIONS_CHANGED_EVENT, onChanged);
  };
}
