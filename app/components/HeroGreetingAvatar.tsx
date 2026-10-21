"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { useAvatarMotion } from "app/lib/use-avatar-motion";

import { getProfileAvatarTier } from "app/lib/profile-appearance";

// The avatar art (icons, partner/admin artwork) loads after the greeting;
// the initial underneath holds the same 40px box, so nothing moves.
const ProfileAvatar = dynamic(
  () => import("./ProfileAvatar").then((module) => module.ProfileAvatar),
  { ssr: false, loading: () => null }
);

// Same localStorage key AccountInfo.tsx writes when the avatar is chosen.
const readCachedAvatar = (uid: string) => {
  try {
    return window.localStorage.getItem(`partson:avatar:${uid}`);
  } catch {
    return null;
  }
};

type HeroGreetingAvatarProps = {
  uid: string;
  name: string;
  /** From users/{uid}; undefined while the profile is still loading. */
  avatarId: string | null | undefined;
  frameId: string | null;
  isPartner: boolean;
  isAdmin: boolean;
};

export default function HeroGreetingAvatar({ uid, name, avatarId, frameId, isPartner, isAdmin }: HeroGreetingAvatarProps) {
  const [cachedAvatarId, setCachedAvatarId] = useState<string | null>(() => readCachedAvatar(uid));
  useEffect(() => {
    setCachedAvatarId(readCachedAvatar(uid));
  }, [uid]);

  const initialMotionRef = useAvatarMotion(true);

  const chosen = avatarId === undefined ? cachedAvatarId : avatarId;
  const tier = getProfileAvatarTier(chosen);
  // Partner and admin artwork follows the account's current status, as in the profile.
  const shownAvatarId =
    tier === "basic" || (tier === "partner" && isPartner) || (tier === "admin" && isAdmin) ? chosen : null;
  const initial = (name.trim().charAt(0) || "P").toUpperCase();

  return (
    <button
      type="button"
      className="hero-greeting-avatar"
      aria-label="Відкрити профіль"
      title="Профіль"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("openAuthModal", { detail: { initialMode: "login", initialAccountTab: "profile" } })
        )
      }
    >
      <span ref={initialMotionRef} className="hero-greeting-avatar-initial" aria-hidden="true">{initial}</span>
      {shownAvatarId || frameId ? (
        <ProfileAvatar
          avatarId={shownAvatarId}
          frameId={frameId}
          initial={initial}
          motionTier={isAdmin ? "admin" : isPartner ? "partner" : "basic"}
          animated
          className="hero-greeting-avatar-art"
        />
      ) : null}
    </button>
  );
}
