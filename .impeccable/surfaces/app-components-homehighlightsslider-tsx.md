---
version: 1
slug: "app-components-homehighlightsslider-tsx"
primary_target: "app/components/HomeHighlightsSlider.tsx"
related_targets: ["app/page.tsx","app/components/HomeHighlightsSection.tsx","app/api/home-blog/route.ts","app/inform/section-config.ts"]
---

# Homepage article and service showcase

Mode: Persuade. Full-width photographic treatment directly below the hero, requested November 26, 2026. The user clarified that photos should have no embedded lettering; HTML headings, descriptions and buttons stay visible. Preserve the surrounding homepage and PartsON's ink/teal palette and existing typography.

## Visual direction

Two edge-to-edge panels with no exterior gutters, gaps, rounded card frames or thumbnail columns. Article copy overlays a clean parts-workbench photograph; diagnostics copy overlays a clean OBD scanner/engine photograph. Dark directional gradients protect text contrast while allowing the photographic subjects to remain visible on the right. Copy follows the shared page-shell edges. Reading time follows the article title. Both primary actions use the same mint button. Navigation sits at the article panel's lower right on desktop and upper right on mobile, with a tabular count and two 44px arrow buttons.

Desktop: 300px high, 1.3:1 article/service columns. Tablet (768–1100px): 340px high. Mobile: 470px high, with a 300px article above a 170px diagnostics panel; each background fills its entire panel. A single article panel without diagnostics uses 300px on mobile. Responsive title/excerpt clamps and fixed heights prevent shifts while scrolling or changing articles.

## Behavior and loading

Only published article text rotates; diagnostics stays persistent. One article is static. Multiple articles retain five-second crossfades, manual arrows, keyboard arrows and touch swipes. Suspend autoplay offscreen or in hidden tabs. Outgoing slides are inert; reduced motion removes the crossfade. No scroll listeners or autonomous background motion. Fine-pointer hover and keyboard focus reveal the image through a fading tint, increase photo opacity from .88 to 1 and gently scale it to 1.035. The fixed directional gradient always protects text contrast. Only the existing image and a CSS overlay animate; no new image requests, JS listeners, live blur or layout changes. Hover emphasis is suppressed during scrolling, coarse pointers keep a stable image, and reduced motion disables zoom and animated transitions.

The article background element stays mounted outside the changing text slides and follows the selected article’s local generated cover. The eight existing articles have individual text-free product compositions; the general overview uses a ninth composition. No catalog/legacy-image requests or runtime image transforms are needed. Background requests use low priority so the hero can lead; subsequent backgrounds download only when selected and then use immutable static caching. Text changes never wait for remote image decoding. Blog cards and article pages use 640/960/1200px responsive sources; social previews and structured data use matching precompressed aspect-ratio crops. New uploaded Storage covers or explicit image removal take precedence over these legacy-cover replacements.

Use getHomeBlogHighlights from home-blog-preview-cache for both the streamed section and preview API. Cache compact highlights for 600s under the existing blog-posts tag; failed reads must not cache an empty result. Suspense streams the usable overview and its background immediately while awaiting the real server result. Existing titles, excerpts and links remain accurate. No fabricated content.

## Assets and validation

Article provenance: nine compositions generated with the built-in image_gen.imagegen tool from catalog, shop and existing component-image references. Files, exact prompts and reference provenance: public/images/blog/editorial-v1/README.md and generation.json. No embedded lettering, logos or labels. Diagnostics provenance: public/images/home/highlights/diagnostics-v1.webp, a 960px WebP derivative of existing public/images/information/diagnostics-hero-v1.webp. Conversion parameters are in public/images/home/highlights/README.md. The generated backgrounds preserve the established palette and separate HTML copy from imagery.

Chrome review at 320, 390, 768, 1024, 1440 and 1920px checks full-viewport width, overflow, action/control separation, loaded backgrounds, visible keyboard focus, navigation, mobile swipes and autoplay. Initial display downloads the current static background and diagnostics; switching loads the corresponding local article background. Verified all eight title/background pairs and zero legacy blog-cover requests. Blog listing and article screenshots at 390/1440px verify generated responsive sources, with all eight covers present and matching social metadata/crops. TypeScript, targeted ESLint, production CSS compilation and existing homepage cover/cache tests pass. Review captures: output/home-highlights-fullbleed/ (local, ignored).

Editorial cover sizes: 640px mobile files are about 9–15 KB; 1200px covers are about 24–50 KB. Local review: output/article-images/contact-sheet.jpg and the home/blog/article screenshots beside it.

## Gradient and hover finish

Article and diagnostics panels share a dark-to-transparent directional gradient, a separate translucent blue/teal veil, softly graded mint controls and translucent navigation. Focus mirrors hover and retains a visible outline. Blog preview links use the same photo reveal/zoom and gradient family; the article reading image remains still. Chrome verification at 1440px, 390px and 320px confirmed full width, no overflow, no touch zoom and working keyboard focus. Computed reduced-motion states have no image/arrow transforms and zero transition duration. Review captures: output/hover-polish/.

## Typography (26.11)

One display role shared by both panel titles: Exo 2 760, clamp(24px, 1.85vw, 29px) / 1.14, -.018em, balanced (mobile 21/25, article title clamped to two lines). The article title selector outranks the homepage-wide `.home-static h3` 18px rule, which had made it smaller than the diagnostics title. Teaser and service line 15px / 1.55 (mobile 14/20), reading time 13px tabular, both actions 14px. Verified at 1440, 900, 390 and 320px: no overflow, copy fits the fixed panel heights.

## Article change motion (26.11)

"Sleight of hand", direction-aware (next = left→right, previous = right→left): the old copy dissolves into an 8px blur and slides 18px out (380ms ease-in); the incoming photo materialises over the outgoing one through a moving gradient mask with blur/brightness settling (900ms), led by a screen-blended teal light band; the title is drawn on with a clip-path wipe from blur (760ms, +140ms), then reading time, teaser and actions surface in a 300/380/460ms stagger. Neighbouring backgrounds are preloaded so the reveal never uncovers an undecoded image. Reduced motion: no sweep, no mask, no text choreography — a 300ms photo crossfade only. Frames verified headless at 1440 and 390px.

## Resting light, alignment, accents (26.11, revised)

No pointer-following light (removed at the user's request). Resting shades are lighter (article 80→64→32→0%, service 80→63→30→0%; mobile 84/69/46 and 84/68/32; text contrast measured ≥7.8:1) and photos sit at .96 opacity. Hover lifts a whole panel evenly: shade opacity .8 and photo brightness 1.1. A teal hairline lights the block's top edge. Desktop 320px / tablet 360px: both panels align to a shared 38px top (titles on one line) and pin their actions to a shared bottom line; article copy up to 35rem (title 28ch, teaser 54ch), service card 27rem. Accents: the title's part after the colon (or a trailing "у Львові") in mint #9ff0e8, reading time as a teal-outlined pill, service keywords as a dot-separated run (commas kept for screen readers). CTAs: white inner rim + teal halo on hover; «Усі статті» draws an underline; arrows glow. All eight articles verified at 1440/900/390px without overflow.

## Frosted rest state (26.11)

At rest each photo is frosted under the copy and sharp toward the far edge: the veil pseudo-element carries `backdrop-filter: blur(9px) saturate(1.08)` masked 100% → 35% → 0 (0/32/58/78%), and the whole photo layer fades into the panel colour on the copy side (mask 55% → 100% by 58%). On mobile the article frost runs bottom-up, matching its bottom-set copy. Hover/focus fades the frost to reveal the sharp photo (existing opacity transition).

## Relief (26.11)

Light from above: each panel has an inset bright top rim and glow, shading pooled at the bottom and side edges (inset shadows on a z -1 pseudo between photo and copy); the panel divider is a 2px bevel (dark + light line); titles carry a 1px drop plus a soft 22px shadow, teaser/service lines a soft halo; the reading-time pill, CTAs (white top rim, darker bottom lip, two-step drop shadow), arrow chips and slider controls are raised; the block casts a two-layer shadow onto the next section.
