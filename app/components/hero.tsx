import { preload } from "react-dom";

import LazyHeroAccountClient from "./LazyHeroAccountClient";
import HeroIntroCard from "./HeroIntroCard";
import HeroParallaxBackground from "./HeroParallaxBackground";

// Served as static files (nginx, immutable) rather than through the Next
// image optimizer: on the 2 GB server a cold optimizer cache — after every
// deploy — kept the hero photo ~1s behind the page. Under the dark wash a
// 768px copy is plenty on phones, so `sizes` caps them there even at 3x DPR.
// v2: the storefront graded ink-blue shadows → slate mids → clean cool-white highlights, with a trace of its real
// colour, cropped to the windows, and with a baked asymmetric oval blur: sharp
// across the logo column and windows, 18px toward the copy side (left) but at
// most 6px toward the right edge. A
// matching oval CSS mask (globals.css, .hero-photo) dissolves it into the ink
// ground. Baked into the
// files so the browser never runs a full-width filter.
const HERO_PHOTO_SRC = "/storefront/photos/partson-store-1-hero-v2-1280.webp";
const HERO_PHOTO_SRCSET =
  "/storefront/photos/partson-store-1-hero-v2-768.webp 768w, /storefront/photos/partson-store-1-hero-v2-1280.webp 1280w";
const HERO_AVIF_SRC = "/storefront/photos/partson-store-1-hero-v2-1280.avif";
const HERO_AVIF_SRCSET =
  "/storefront/photos/partson-store-1-hero-v2-768.avif 768w, /storefront/photos/partson-store-1-hero-v2-1280.avif 1280w";
const HERO_PHOTO_SIZES = "(max-width: 767px) 256px, 100vw";

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
  // Copy-side scrim: reliable ink under the H1, intro and quick links,
  // opening up so the sharp showcase carries the right half.
  "linear-gradient(100deg, rgba(4,9,28,0.84) 0%, rgba(4,9,28,0.66) 28%, rgba(4,9,28,0.32) 52%, rgba(4,9,28,0.06) 74%, transparent 100%)",
  // Header fade, and a landing in the articles block's own ink below.
  "linear-gradient(180deg, rgba(4,9,28,0.86) 0%, rgba(4,9,28,0.36) 20%, transparent 40%)",
  "linear-gradient(0deg, rgba(8,24,44,0.94) 0%, rgba(8,24,44,0.46) 16%, transparent 36%)",
  // A cool shaft of light falls onto the shop windows from the top right…
  "radial-gradient(ellipse 50% 76% at 78% -10%, rgba(165,205,255,0.2) 0%, rgba(59,130,246,0.06) 46%, transparent 72%)",
  // …with a faint warm catch-light in the very corner (no warm wash over
  // the photo: on its blue-grey that read as a muddy brown).
  "radial-gradient(ellipse 26% 38% at 98% 0%, rgba(255,214,170,0.14) 0%, transparent 70%)",
  // Cool accent behind the heading.
  "radial-gradient(ellipse 58% 52% at 8% 18%, rgba(96,165,250,0.16) 0%, rgba(59,130,246,0.04) 46%, transparent 70%)",
  // Lens vignette.
  "radial-gradient(ellipse 120% 105% at 66% 44%, transparent 56%, rgba(2,6,20,0.55) 100%)",
].join(", ");
const depthBackgroundSize = "auto, auto, auto, auto, auto, auto, auto";
const depthBackgroundPosition = "0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0";

const Hero = () => {
  // What next/image's `preload` did: a <link rel="preload"> in <head> with the
  // same srcset, so the photo starts with the HTML, not after layout.
  preload(HERO_AVIF_SRC, {
    type: "image/avif",
    as: "image",
    imageSrcSet: HERO_AVIF_SRCSET,
    imageSizes: HERO_PHOTO_SIZES,
    fetchPriority: "high",
  });
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
        <picture>
          <source type="image/avif" srcSet={HERO_AVIF_SRCSET} sizes={HERO_PHOTO_SIZES} />
          <img
            src={HERO_PHOTO_SRC}
            srcSet={HERO_PHOTO_SRCSET}
            sizes={HERO_PHOTO_SIZES}
            alt=""
            fetchPriority="high"
            decoding="async"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "62% 46%",
            }}
          />
        </picture>
      </HeroParallaxBackground>
      <div
        aria-hidden="true"
        className="hero-depth-background pointer-events-none absolute inset-0 z-[1]"
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

          {/* Greeting, actionable benefits and the saved account profile. */}
          <div
            className="hero-account-surface hero-bonus-surface flex min-w-0 flex-col justify-center gap-3 rounded-[24px] border border-white/30 bg-slate-950/70 p-3.5 shadow-[0_24px_64px_rgba(2,6,23,0.38),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl sm:p-4 lg:p-4"
          >
            <LazyHeroAccountClient variant="panel" />

          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
