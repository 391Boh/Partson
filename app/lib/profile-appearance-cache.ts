// Instant-paint cache for the chosen profile cover and avatar frame: the home
// greeting, the profile window and the cart/contact covers render them on the
// first client frame instead of switching once users/{uid} arrives. Firestore
// stays the source of truth; every snapshot rewrites these values. Kept free
// of firebase imports so the homepage bundle doesn't pull them in.

const BACKGROUND_PREFIX = "partson:profileBackground:";
const FRAME_PREFIX = "partson:avatarFrame:";
export const PROFILE_BACKGROUND_EVENT = "partson:profileBackgroundChange";

const read = (key: string) => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** True when the stored value changed (or storage is unavailable). */
const write = (key: string, value: string) => {
  try {
    if (window.localStorage.getItem(key) === value) return false;
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the value falls back to the Firestore read
  }
  return true;
};

/** Stored id, "default" for the stock cover, or null when nothing is cached. */
export function readCachedProfileBackground(uid: string | null | undefined) {
  return uid ? read(BACKGROUND_PREFIX + uid) : null;
}

export function writeCachedProfileBackground(uid: string | null | undefined, id: string | null) {
  if (!uid || typeof window === "undefined") return;
  // Other mounted covers only need to hear about an actual change.
  if (!write(BACKGROUND_PREFIX + uid, id ?? "default")) return;
  window.dispatchEvent(new CustomEvent(PROFILE_BACKGROUND_EVENT, { detail: { uid, id } }));
}

/** Stored frame id, "none" for no frame, or null when nothing is cached. */
export function readCachedAvatarFrame(uid: string | null | undefined) {
  return uid ? read(FRAME_PREFIX + uid) : null;
}

export function writeCachedAvatarFrame(uid: string | null | undefined, id: string | null) {
  if (!uid || typeof window === "undefined") return;
  write(FRAME_PREFIX + uid, id ?? "none");
}
