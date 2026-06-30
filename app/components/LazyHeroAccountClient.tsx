"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

type HeroAccountClientProps = {
  cardGradientBase: string;
  cardGradientHover: string;
  cardInteractionStatic: string;
  variant?: "actions" | "benefits";
};

type RequestIdleCallback = (
  callback: () => void,
  options?: { timeout: number }
) => number;

const HeroAccountClient = dynamic(() => import("./HeroAccountClient"), {
  ssr: false,
});

const getFallbackClassName = (variant: HeroAccountClientProps["variant"]) =>
  variant === "benefits"
    ? "home-glass-card flex min-h-[180px] h-full min-w-0 rounded-2xl border border-white/10 bg-white/10 md:col-span-2 lg:col-span-1 sm:min-h-0"
    : "flex min-h-[42px] min-w-[272px] items-center justify-center sm:min-h-[44px] sm:min-w-[292px]";

const HeroAccountFallback = ({
  onFocus,
  onPointerEnter,
  variant,
}: {
  onFocus: () => void;
  onPointerEnter: () => void;
  variant: HeroAccountClientProps["variant"];
}) => (
  <div
    className={getFallbackClassName(variant)}
    aria-hidden="true"
    onFocus={onFocus}
    onPointerEnter={onPointerEnter}
  >
    {variant === "benefits" ? (
      <div className="h-full w-full rounded-2xl border border-white/10 bg-white/[0.06]" />
    ) : (
      <span className="h-10 w-[220px] rounded-[14px] border border-white/15 bg-white/10" />
    )}
  </div>
);

export default function LazyHeroAccountClient(props: HeroAccountClientProps) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad || typeof window === "undefined") return;

    const win = window as Window & {
      requestIdleCallback?: RequestIdleCallback;
      cancelIdleCallback?: (id: number) => void;
    };
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const load = () => setShouldLoad(true);

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(load, { timeout: 1400 });
    } else {
      timeoutId = window.setTimeout(load, 900);
    }

    return () => {
      if (idleId != null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldLoad]);

  if (!shouldLoad) {
    return (
      <HeroAccountFallback
        variant={props.variant}
        onPointerEnter={() => setShouldLoad(true)}
        onFocus={() => setShouldLoad(true)}
      />
    );
  }

  return <HeroAccountClient {...props} />;
}
