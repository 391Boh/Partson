"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import HeroAccountClientDirect from "./HeroAccountClient";

type HeroAccountClientProps = {
  cardGradientBase: string;
  cardGradientHover: string;
  cardInteractionStatic: string;
  variant?: "actions" | "benefits";
};

// ssr: false avoids hydration mismatch — client localStorage auth check can differ from server
const HeroAccountClientLazy = dynamic(() => import("./HeroAccountClient"), {
  ssr: false,
});

function LazyActionsClient(props: HeroAccountClientProps) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;
    const id = window.requestAnimationFrame(() => setShouldLoad(true));
    return () => window.cancelAnimationFrame(id);
  }, [shouldLoad]);

  if (!shouldLoad) {
    return (
      <div
        className="flex min-h-[42px] min-w-[272px] items-center justify-center sm:min-h-[44px] sm:min-w-[292px]"
        aria-hidden="true"
        onFocus={() => setShouldLoad(true)}
        onPointerEnter={() => setShouldLoad(true)}
      >
        <span className="h-10 w-[220px] rounded-[14px] border border-white/15 bg-white/10" />
      </div>
    );
  }

  return <HeroAccountClientLazy {...props} />;
}

export default function LazyHeroAccountClient(props: HeroAccountClientProps) {
  // Benefits card content (benefit items) is identical server/client on first render
  // (hasOrders is null on both sides), so SSR is safe and eliminates 1400ms CLS.
  if (props.variant === "benefits") {
    return <HeroAccountClientDirect {...props} />;
  }
  return <LazyActionsClient {...props} />;
}
