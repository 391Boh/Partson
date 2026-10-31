"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useAvatarMotion } from "app/lib/use-avatar-motion";
import { findProfileBackground, PROFILE_BACKGROUNDS } from "app/lib/profile-appearance";
import { PROFILE_BACKGROUND_EVENT, readCachedProfileBackground, writeCachedProfileBackground } from "app/lib/profile-appearance-cache";

// The cover chosen in the profile also dresses the header of the cart and
// contact windows. The profile keeps a per-user cache, so the cover is there
// on first paint; one read of the user doc corrects it if it went stale.
export { PROFILE_BACKGROUND_EVENT, writeCachedProfileBackground } from "app/lib/profile-appearance-cache";

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
        writeCachedProfileBackground(uid, stored);
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
