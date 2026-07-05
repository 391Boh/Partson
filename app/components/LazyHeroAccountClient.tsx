"use client";

import dynamic from "next/dynamic";
import HeroAccountClientDirect from "./HeroAccountClient";

type HeroAccountClientProps = {
  cardGradientBase: string;
  cardGradientHover: string;
  cardInteractionStatic: string;
  variant?: "actions" | "benefits";
};

// ssr: false avoids hydration mismatch — client localStorage auth check can differ from server.
// Loading skeleton matches the inner "not ready" state of HeroAccountClient to prevent
// the hero section from being 0px tall before JS loads, which causes CLS when buttons appear.
const HeroAccountClientLazy = dynamic(() => import("./HeroAccountClient"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[42px] min-w-[272px] flex-wrap items-center justify-center gap-2 sm:min-h-[44px] sm:min-w-[292px]">
      <span className="inline-block h-10 w-[220px] rounded-[14px] border border-white/15 bg-white/10" />
    </div>
  ),
});

export default function LazyHeroAccountClient(props: HeroAccountClientProps) {
  // Benefits card content (benefit items) is identical server/client on first render
  // (hasOrders is null on both sides), so SSR is safe and eliminates 1400ms CLS.
  if (props.variant === "benefits") {
    return <HeroAccountClientDirect {...props} />;
  }
  return <HeroAccountClientLazy {...props} />;
}
