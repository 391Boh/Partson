---
version: 1
slug: "app-components-homehighlightsslider-tsx"
primary_target: "app/components/HomeHighlightsSlider.tsx"
related_targets: ["app/page.tsx","app/components/HomeHighlightsSection.tsx","app/api/home-blog/route.ts"]
---

# Homepage article and service showcase

Scope: extend the established homepage, directly below its hero (confirmed by the user). Mode: Persuade. Restore prominent links to the existing blog and diagnostics service, with a compact unified preview and a persistent diagnostics button on the right. Published articles load from the existing blog; services opt in through informationSections.homeFeature. No fabricated articles or services; preserve the established identity. The current one-article/one-service state is static, with a larger persistent diagnostics button. Animated autoplay and manual arrows return only when another article or service is added. Filters and thumbnails remain removed.

## Direction contract

THESIS: One shared editorial player brings advice and practical service together, rather than scattering two disconnected promotional tiles.

OWN-WORLD: Inherit PartsON's blue/teal palette, heavy existing UI typography, light tinted section surfaces and rounded controls. A real cover image fades through a gradient transparency mask into a dark ink/teal background behind the heading, description and CTA; compact controls sit within the image.

STORY: Drivers discover an actual article or service, preview it, then follow its direct link. Blog and diagnostics remain reachable even if article loading fails.

FIRST VIEWPORT: Immediately beneath the existing hero: a unified image/text slide with its CTA on a quiet cool background, without a separate heading, description or blog link above it. The image fades toward the reading area horizontally on desktop and vertically on mobile. The diagnostics button stays on the right and navigation stays at the lower right, without a separate footer. Start the preview at 280 px on desktop and 380 px on mobile for both static content and a carousel. Keep that responsive height, type, spacing and diagnostics image size stable during scroll; keep the delivery-aligned button width.

FORM: Local extension, directly specified slider structure; seed key: not applicable (no concept tournament for a local extension). Interaction: one article plus one service stays static; additional articles or services enable a 5-second automatic crossfade without a play/pause toggle, manual arrows, arrow-key control and touch swipe. Continue through hover, focus and manual changes; suspend offscreen or in hidden tabs. Scroll never changes layout or animates masked backgrounds; reduced motion keeps five-second changes without animation. At most two slide layers are mounted, with the outgoing layer inert.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Established-world exception: preserve existing design documentation; this addition does not create a new DESIGN.md or replace the global system. Reused raster provenance: diagnostics-hero-v1.webp already shipped in public/images/information; blog covers come from published posts through the existing image route; fallback Car-parts-fullwidth.webp is an existing repository asset. No generated or copied raster assets.
