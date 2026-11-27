# Homepage startup

Mode: Operate. Scope: the loading and first-paint experience on `/`, preserving the current PartsON hero, catalogue journeys and visual identity.

The hero remains server-rendered and readable on the first paint. A single 520ms vertical settling gesture with a gentle 92% to 100% opacity arrival replaces separately delayed blur, pop and opacity entrances. Titles, descriptions and actions never wait for this animation to become visible. The preloaded static storefront photo settles in 700ms without animating opacity. Reduced motion keeps the presentation static.

The streamed highlights fallback remains useful through its blog and service links, but does not download a temporary generic article photograph before the published article arrives. Actual editorial covers use the existing responsive WebP sources. Neighbour warming selects the same responsive source as the visible cover and uses low fetch priority; Save-Data and slow connections skip speculative downloads. Automatic rotation pauses for reduced motion, hidden pages, Save-Data and slow connections. Manual controls remain available.

Catalogue placeholders use the upcoming section title, a quiet loading track and a responsive six-tile preview. Slot dimensions remain unchanged. Content uses a 360ms opacity / 440ms six-pixel transform transition instead of a replayable entrance keyframe; leaving the scrolling state cannot return ready content to zero opacity. A visibility observer runs the small loading-track animation only while the pending section intersects the viewport, pauses it during scrolling, and disconnects when the section becomes ready. Save-Data and reduced motion keep it static. Existing bounded mounting, CSS readiness, error recovery and distant-module deferral remain intact.

The static new-arrivals section uses its real layout from first paint rather than an estimated content-visibility height; image dimensions and native lazy loading remain in place. This removes the measured decorative movement when its estimated height was replaced on desktop.

Validation artifacts: `output/home-startup/`. Local cold-cache browser measurements use a 70ms network delay, 750KB/s download throughput and 4× CPU slowdown. They are development-server diagnostics, not production CWV results. Browser checks cover 320, 390, 768 and 1440px, readable first-screen content, no overflow, visible/offscreen loading, reduced motion and client errors. Existing deferred-loading and stylesheet-startup regressions, TypeScript, targeted ESLint and production CSS compilation are checked.

Measurement limits: development recompilation varied TTFB from under a second to 13 seconds across captures, so these runs do not establish a production LCP improvement. The mobile published cover selection changed from the 960px file (24,542 bytes before transfer overhead) to the 640px file (12,648 bytes). The temporary overview image request is eliminated.

## Continuity and no-flash finish

Stopping scroll previously restored the ready section’s entrance animation after the scroll guard had set animation to none, replaying it from zero opacity. State transitions now retain the final visible values when that guard is removed.

A new article/service photo receives one 480ms reveal only when its resource completed after hydration. Already downloaded photos, repeated load events and the existing carousel materialisation do not acquire a second fade. Reduced motion skips the reveal; changing that preference cancels an active reveal. No foreground is gated on photo loading.

Regression coverage: `scripts/test-home-reveal-stability.mjs` is included in the browser suite. It verifies repeated scroll/stop cycles never dim ready content or shift the following block, cached images stay visible, newly arrived images reveal once and reduced motion remains static. The live homepage also passes delayed-full-CSS and delayed-photo checks at 390/1440px: typography stays identical, each first-screen entrance runs once, and there is no horizontal overflow or client exception. Captures: `output/home-no-flash/`.
