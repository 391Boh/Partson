"use client";

import dynamic from "next/dynamic";

type HeroAccountClientProps = {
  variant?: "actions" | "benefits" | "panel";
};

const HeroAccountClientDirect = dynamic(() => import("./HeroAccountClient"), {
  ssr: false,
  loading: () => <HeroAccountPlaceholder variant="panel" />,
});

function HeroAccountPlaceholder({ variant }: HeroAccountClientProps) {
  if (variant === "panel") {
    return (
      <>
        <div className="hero-account-placeholder" aria-hidden="true">
          <span className="block h-7 w-56 max-w-full rounded-lg bg-white/10" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="block h-[62px] rounded-xl bg-white/10" />
            <span className="block h-[62px] rounded-xl bg-white/10" />
          </div>
        </div>
        <div className="hero-account-actions-placeholder flex min-h-[82px] flex-col items-center justify-end gap-3">
          {/* Real copy, not a skeleton bar — this line is identical in
              HeroAccountClient's own !isAuthReady and !user branches (only
              the buttons below actually depend on auth state), so there is
              nothing to guess here. Rendering it server-side instead of a
              generic bg-white/10 bar gives the hero panel real, immediately
              paintable content instead of one that only exists once the
              ssr:false chunk (and Firebase) resolve — that gap was showing
              up as this exact line becoming the page's Largest Contentful
              Paint at 5-12s under throttled mobile conditions. */}
          <p className="font-display max-w-[30ch] text-[20px] font-semibold italic leading-snug text-sky-100/95 [text-shadow:0_2px_10px_rgba(2,6,23,0.92)] after:mx-auto after:mt-2.5 after:block after:h-0.5 after:w-20 after:bg-gradient-to-r after:from-transparent after:via-sky-300/80 after:to-transparent sm:text-[23px]">
            <strong className="font-black not-italic text-slate-100">Зручний профіль</strong> користувача!
          </p>
          <div className="flex gap-2" aria-hidden="true">
            <span className="block h-12 w-32 rounded-xl bg-white/10" />
            <span className="block h-12 w-32 rounded-xl bg-white/10" />
          </div>
        </div>
      </>
    );
  }
  if (variant === "benefits") {
    return (
      <div className="hero-account-placeholder" aria-hidden="true">
        <span className="block h-7 w-56 max-w-full rounded-lg bg-white/10" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span className="block h-[62px] rounded-xl bg-white/10" />
          <span className="block h-[62px] rounded-xl bg-white/10" />
        </div>
      </div>
    );
  }
  return (
    <div className="hero-account-actions-placeholder flex min-h-[82px] flex-col items-center justify-end gap-3" aria-hidden="true">
      <span className="block h-5 w-48 rounded-lg bg-white/10" />
      <div className="flex gap-2">
        <span className="block h-12 w-32 rounded-xl bg-white/10" />
        <span className="block h-12 w-32 rounded-xl bg-white/10" />
      </div>
    </div>
  );
}

export default function LazyHeroAccountClient(props: HeroAccountClientProps) {
  // This block is above the fold and its auth-dependent content is useful
  // immediately. Rendering the dynamic boundary on the first client pass
  // starts downloading its chunk straight away; the previous idle gate added
  // 0.3s for guests and up to several seconds for returning users before the
  // browser even requested it. The loading component has the final panel's
  // footprint, so starting sooner does not trade speed for layout shift.

  if (props.variant === "panel") {
    return <HeroAccountClientDirect variant="panel" />;
  }

  return (
    <HeroAccountClientDirect
      variant={props.variant === "benefits" ? "benefits" : "actions"}
    />
  );
}
