"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useAvatarMotion } from "app/lib/use-avatar-motion";
import { findProfileBackground, PROFILE_BACKGROUNDS } from "app/lib/profile-appearance";

// The cover chosen in the profile also dresses the header of the cart and
// contact windows. The profile keeps a per-user cache, so the cover is there
// on first paint; one read of the user doc corrects it if it went stale.
const CACHE_PREFIX = "partson:profileBackground:";
export const PROFILE_BACKGROUND_EVENT = "partson:profileBackgroundChange";

export function writeCachedProfileBackground(uid: string | null | undefined, id: string | null) {
  if (!uid) return;
  try {
    localStorage.setItem(CACHE_PREFIX + uid, id ?? "default");
  } catch {
    // storage unavailable: the cover falls back to a Firestore read
  }
  window.dispatchEvent(new CustomEvent(PROFILE_BACKGROUND_EVENT, { detail: { uid, id } }));
}

function readCachedProfileBackground(uid: string | undefined) {
  if (!uid) return null;
  try {
    return localStorage.getItem(CACHE_PREFIX + uid);
  } catch {
    return null;
  }
}

function useProfileBackgroundImage() {
  const uid = auth.currentUser?.uid;
  const [id, setId] = useState<string | null>(() => readCachedProfileBackground(uid));

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, "users", uid))
      .then((snapshot) => {
        if (cancelled || !snapshot.exists()) return;
        const stored = findProfileBackground(snapshot.data().profileBackground)?.id ?? null;
        setId(stored);
        try {
          localStorage.setItem(CACHE_PREFIX + uid, stored ?? "default");
        } catch {
          // ignore
        }
      })
      .catch(() => undefined);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string; id?: string | null }>).detail;
      if (detail?.uid === uid) setId(detail.id ?? null);
    };
    window.addEventListener(PROFILE_BACKGROUND_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_BACKGROUND_EVENT, onChange);
    };
  }, [uid]);

  return (findProfileBackground(id) ?? PROFILE_BACKGROUNDS[0]).image;
}

/** Animated cover layer for a `.cw-hub` header. */
export default function WindowHubCover() {
  const image = useProfileBackgroundImage();
  const motionRef = useAvatarMotion(true);
  return (
    <span
      ref={motionRef}
      className="profile-cover-background cw-hub-cover"
      aria-hidden="true"
      style={{ backgroundImage: `url("${image}")` }}
    />
  );
}
