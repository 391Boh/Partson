import Image from "next/image";
import heroPhoto from "../../public/storefront/photos/partson-store-1.webp";
import { Factory, Package, Car } from "lucide-react";

import LazyHeroAccountClient from "./LazyHeroAccountClient";
import HeroIntroCard from "./HeroIntroCard";
import HeroParallaxBackground from "./HeroParallaxBackground";

// Was 5 separate absolutely-positioned <span> overlays + 2 CSS-class-driven
// ::before/::after pseudo-elements stacked on top of this section (~8
// compositor layers for one above-the-fold block). Every one of those static
// (non-interactive) layers is folded into this single background-image —
// CSS renders unlimited comma-separated gradients on one element for free.
// The real storefront photo used to be the bottom-most layer in this same
// list, but a scroll-driven parallax drift + zoom needs to transform the
// photo independently of these gradients, so it now lives in its own
// element (`HeroParallaxBackground`, absolutely positioned behind this
// gradient overlay, itself behind the section content). The vignette
// (already close to fully opaque at the top, ~62% dark at the bottom) does
// the "wash and darken the edges" work with no extra blur layer needed — a
// blur filter would have to sit on its own element to avoid blurring the
// text on top of it.
const depthBackgroundLayers = [
  // Left-column scrim, on top of every glow below it — the storefront photo
  // has bright patches (signage, price tags) that drift under the intro
  // text depending on viewport size, and no amount of text-shadow alone
  // reliably reads against them. Strengthened and pushed further right
  // (was fully faded by 68%, down to 0.16 already at 50% — too weak by the
  // time it reached the H1's own column width) so the whole HeroIntroCard
  // column — heading, eyebrow, quick-link cards — sits over a reliably dark
  // backdrop, and still fades out before the login buttons / benefits
  // column so those keep showing the photo without an extra tint.
  "linear-gradient(100deg, rgba(2,6,23,0.7) 0%, rgba(2,6,23,0.56) 30%, rgba(2,6,23,0.32) 55%, transparent 76%)",
  // Top-left glow, toned down (was 0.34 peak) — it sat directly behind the
  // H1/icon in HeroIntroCard and washed the light heading text out against
  // it. Kept as a soft accent, not a bright patch competing with the text.
  "radial-gradient(ellipse 110% 58% at 12% 2%, rgba(56,189,248,0.20) 0%, rgba(56,189,248,0.05) 40%, transparent 64%)",
  "radial-gradient(ellipse 84% 60% at 88% 5%, rgba(37,99,235,0.20) 0%, rgba(37,99,235,0.04) 44%, transparent 68%)",
  "radial-gradient(ellipse 96% 52% at 56% 90%, rgba(37,99,235,0.14) 0%, rgba(37,99,235,0.02) 46%, transparent 68%)",
  // sky-blue top-left — same reduction as above, this is the tighter/darker
  // companion layer that used to double up the wash-out right behind the H1.
  "radial-gradient(ellipse 120% 64% at 7% 4%, rgba(56,189,248,0.20) 0%, rgba(56,189,248,0.06) 36%, rgba(56,189,248,0.01) 54%, transparent 68%)",
  // blue top-right
  "radial-gradient(ellipse 98% 70% at 95% 4%, rgba(37,99,235,0.20) 0%, rgba(37,99,235,0.05) 40%, transparent 66%)",
  // blue bottom glow — centred, same depth
  "radial-gradient(ellipse 120% 56% at 50% 108%, rgba(14,116,144,0.20) 0%, rgba(14,165,233,0.06) 48%, transparent 74%)",
  // dark top, slightly lighter (but still heavily tinted) bottom — a real
  // photo sits under this now, so the bottom stayed darker than the old
  // pure-gradient version to keep the photo as atmosphere, not a literal,
  // sharp product shot.
  "linear-gradient(180deg, rgba(2,6,23,0.92) 0%, rgba(5,11,36,0.86) 14%, rgba(9,18,54,0.78) 30%, rgba(13,26,72,0.70) 48%, rgba(16,34,90,0.64) 68%, rgba(12,26,72,0.57) 84%, rgba(10,22,64,0.52) 100%)",
].join(", ");
const depthBackgroundSize = "auto, auto, auto, auto, auto, auto, auto, auto";
const depthBackgroundPosition = "0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0";

const Hero = () => {
  return (
    <section
      // `<main>` skips its usual pt-header-offset on the homepage (see
      // LayoutHost.tsx) specifically so this section can start at the true
      // top of the page in normal flow — no negative margin needed. A
      // negative-margin version of this was tried first, but the wrapper
      // chain around Hero has `contain: paint` / `overflow-x-clip`
      // ancestors (`.home-section-stage`, `.home-static`) that can clip
      // content pushed above its own box by a negative margin, which is
      // too fragile to depend on. Padding-top here does the same job the
      // removed pt-header-offset did, plus the section's own original
      // spacing, so the header height is still accounted for.
      className="hero-section-smooth group/hero font-ui relative isolate z-[1] flex min-h-[400px] w-full select-none items-start overflow-hidden pt-[calc(var(--header-height,4rem)+1.5rem)] pb-6 sm:min-h-[450px] sm:items-center sm:pt-[calc(var(--header-height,4rem)+2.25rem)] sm:pb-9 lg:min-h-[510px] lg:pt-[calc(var(--header-height,4rem)+3rem)] lg:pb-12"
      >
      <HeroParallaxBackground>
        <Image
          src={heroPhoto}
          alt=""
          fill
          preload
          sizes="100vw"
          quality={70}
          style={{ objectFit: "cover", objectPosition: "center 38%" }}
        />
      </HeroParallaxBackground>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage: depthBackgroundLayers,
          backgroundSize: depthBackgroundSize,
          backgroundPosition: depthBackgroundPosition,
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* hover bloom — diffused moonlight from above. The only overlay layer
          left: it's genuinely interactive (opacity transition on hover), so
          it can't be folded into the static background above. Toned down
          from opacity-100 to opacity-65 at full hover — the original read as
          too strong a wash across the whole section. */}
      <span className="home-scroll-decor pointer-events-none absolute inset-0 z-[2] opacity-0 transition-opacity duration-[900ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/hero:opacity-65 bg-[image:radial-gradient(ellipse_240%_120%_at_50%_-12%,rgba(125,211,252,0.16)_0%,rgba(56,189,248,0.06)_38%,transparent_60%),radial-gradient(ellipse_170%_92%_at_6%_4%,rgba(56,189,248,0.18)_0%,rgba(56,189,248,0.04)_44%,transparent_68%),radial-gradient(ellipse_120%_66%_at_94%_5%,rgba(56,189,248,0.10)_0%,rgba(37,99,235,0.02)_42%,transparent_64%),radial-gradient(ellipse_160%_78%_at_50%_112%,rgba(56,189,248,0.16)_0%,rgba(14,165,233,0.07)_42%,transparent_68%),linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.01)_28%,transparent_52%)]" />
      <div className="page-shell-inline relative z-10">
        {/* A generous intro balances the compact account and benefits panel. */}
        <div className="home-hero-grid relative grid gap-6 text-slate-100 md:grid-cols-[minmax(0,1.06fr)_minmax(340px,0.94fr)] md:items-stretch lg:gap-10">
          <HeroIntroCard />

          {/* Right column: one glass card — the account panel plus the
              "online catalogue" intro line + VIN/analog/delivery chips
              beneath it, split by a hairline. */}
          <div
            className="hero-account-surface flex min-w-0 flex-col justify-center gap-4 rounded-[24px] border border-white/30 bg-slate-950/70 p-4 shadow-[0_24px_64px_rgba(2,6,23,0.38),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl sm:p-4 lg:p-5"
          >
            <LazyHeroAccountClient variant="panel" />

            <div className="border-t border-white/12 pt-4">
              <div className="grid grid-cols-3 gap-2">
                <span className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-cyan-200/40 bg-cyan-300/15 px-2 py-2.5 text-center">
                  <Factory className="h-4 w-4 text-cyan-100" strokeWidth={2.2} aria-hidden="true" />
                  <span className="text-[16px] font-black leading-none text-white sm:text-[18px]">130+</span>
                  <span className="text-[9px] font-bold uppercase leading-snug tracking-[0.06em] text-cyan-100/80 sm:text-[9.5px]">виробників</span>
                </span>
                <span className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/30 bg-white/12 px-2 py-2.5 text-center">
                  <Package className="h-4 w-4 text-white" strokeWidth={2.2} aria-hidden="true" />
                  <span className="text-[15px] font-black leading-none text-white sm:text-[17px]">10 000+</span>
                  <span className="text-[9px] font-bold uppercase leading-snug tracking-[0.06em] text-white/75 sm:text-[9.5px]">товарів</span>
                </span>
                <span className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-emerald-200/40 bg-emerald-300/15 px-2 py-2.5 text-center">
                  <Car className="h-4 w-4 text-emerald-100" strokeWidth={2.2} aria-hidden="true" />
                  <span className="text-[16px] font-black leading-none text-white sm:text-[18px]">60+</span>
                  <span className="text-[9px] font-bold uppercase leading-snug tracking-[0.06em] text-emerald-100/80 sm:text-[9.5px]">марок авто</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
