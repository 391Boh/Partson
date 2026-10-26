---
version: 1
slug: home-bottom
primary_target: app/components/AdvantagesSection.tsx
related_targets: [app/page.tsx, app/globals.css]
---

# Store overview and official map

Preserve PartsON typography and light teal/blue palette. Latest user direction replaces delayed map mounting: server-render the official Google Maps iframe with loading=lazy, a reserved responsive height, interactive controls and a separate route link. Network readiness depends on Google; the browser preloads it near the viewport without a click.

Use one original shop photograph, storefront/photos/bg/store-2.webp, as the copy panel background. Remove the foreground gallery and do not repeat the same photo elsewhere in the section. Clear location introduction, compact assortment descriptions, three crawlable directory links, delivery, phone and VIN assistance. No invented claims. Popular groups section is removed from the homepage at user request; its component remains available elsewhere. Photos stay still during scrolling. A directional light wash protects copy contrast while the shop shelves remain visible toward the outer edge. Keep the image absolutely positioned and reserve the copy panel height.

All changes remain local. No deployment authorized. scripts/test-home-map-scroll.mjs verifies server-rendered iframe presence, stable geometry, working image assets, directory links, removed popular section and no horizontal overflow.

Store content is now visible directly in server HTML: the section wrapper has is-revealed without a hydration-dependent observer. The background uses the existing lightweight WebP asset and native image loading without a client-side reveal gate. The official map now uses native lazy loading for the latest homepage performance request; it must not block catalogue preparation.


Latest layout: full-width editorial heading with short copy, then an equal-height location/assortment split. Desktop map is on the left, assortment copy over one shop photograph on the right. Mobile reading order is copy then map. Help area uses the same light teal palette with one chat action and three native details/summary questions (selection, collection address, delivery). Keep answers factual and server-rendered, no extra accordion JavaScript or automatic animations. Opening a question may naturally expand its block after user input.


Copy direction: “Автозапчастини у Львові” is the single main heading; the introduction names PartsON and explains vehicle/article/category selection and delivery. Assortment headings describe actual systems and maintenance items. Keep all text in server HTML and avoid keyword repetition or ranking promises. Current follow-up changes are local only, after production release bc2a820.


Virtual-tour addition: render StoreVirtualTour immediately before home-store-help. The owner supplied the Google photosphere; store-virtual-tour.ts keeps its full encoded panorama ID (decoding it resolves to unrelated outdoor Street View). The original outbound URL includes its iu preview parameter, which is required for Google's photosphere link. Verified that the embed shows the real PartsON interior and retains Google's attribution/fullscreen controls.

The tour has a 440px desktop / 320px mobile frame. Mount its iframe only within 900px of the viewport, or after explicit button activation. Before interaction, pointer-events:none and tabindex=-1 preserve page scrolling; the start button enables controls and the finish button restores scrolling without remounting/reloading the panorama. Reserve footer control space to avoid movement. Text and outbound fallback link render in initial HTML. These changes remain local, with no deployment in this follow-up.


Tour visual polish: light directional header/footer gradients, compass accent, localized 2–3px corner blur clear of Google controls/credits, and an animated launch button with a single reveal and hover sheen. Blur disappears during interaction; prefers-reduced-motion disables animation. Desktop/mobile real-panorama inspection, 1440/390/320px interaction and geometry checks, reduced-motion checks, ESLint, TypeScript and production compilation passed. Local only, no deployment.


Facade-first tour: start at the linked exterior photosphere CAoSHENJQUJJaERweU82YUFqUGxzLVlzYjl1U2lUTm0=, heading 160°, pitch 0°. Verified the PartsON signage/entrance and Google navigation back inside. The outbound link now uses Google Maps map_action=pano with the same full panorama ID. This supersedes the previous interior start and iu-specific outbound-link requirement. No deployment.


### Homepage loading refinement
Tour: a 20KB original facade poster gives the reserved viewer immediate visual content while Google starts; the iframe preloads within 900px, with the same facade-first panorama and scroll/focus controls. Tightened header spacing; retained corner treatment and reduced-motion behavior. The official location map stays server-rendered and now uses native lazy loading, removing offscreen Google work from initial loading.
Blog: preload the first streamed article cover from server HTML, retain readable text independent of image/API completion, and defer the background refresh 2s when server articles already exist. No artificial delay for an empty result.
Verified 390/1440px real Google screenshots and full-page asset traversal: no HTTP errors, JS errors, broken loaded images or horizontal overflow; 320/390/1440px tour controls and stable geometry; first-article stalled-cover/API regression; map geometry; ESLint, TypeScript, production compilation. Local lab CLS 0 on mobile and desktop. No deployment.


Information-card redesign: consolidated the detached SEO heading/intro into the photograph-backed assortment panel. One h2, local catalogue kicker, three numbered h3 rows, a primary catalogue action, secondary delivery link and compact directory navigation. Original 29KB shop photo stays lazy and decorative; no new client code. Preserved adjacent map/tour/help. Checked 390/1440px screenshots on the development server, headings/links, image decode and no horizontal overflow; ESLint, TypeScript and CSS compilation passed. No deployment.


Shared photographic frame: moved the single decorative shop image behind the entire location/assortment grid, including the map surround. Increased image visibility, added a translucent readable copy surface and coordinated map footer. Fine-pointer hover gently scales/saturates the photograph and fades a gradient overlay; no map controls or attribution are covered. Reduced-motion disables transitions/zoom; mobile uses the static treatment. Desktop-hover and mobile screenshots, image decode, heading/navigation counts, overflow, ESLint, TypeScript and CSS build passed. No deployment.


Full-component background: the single shop photograph now belongs directly to home-store-editorial and covers the complete section, including location, tour and help surrounds. Reserved content layers stay above it; responsive cover cropping, readability gradients, fine-pointer hover and reduced-motion behavior are preserved. Checked mobile/desktop section screenshots, single h2, navigation and overflow, plus ESLint/CSS build. Local only.


Natural-scale background and open layout: replaced the 600px cropped background with an optimized 765×1020 WebP from the original shop photo, capped at its native width with no cover stretch, filter or hover zoom. Edge masks blend into the section gradient. Removed decorative card borders/backgrounds/shadows from the grid, copy, tour shell and help; retained rounded actual map/panorama viewports. Hover changes photo opacity only. Mobile/desktop screenshots, headings/navigation/overflow, ESLint and CSS build checked. Local only.


Depth refinement: subtle top-left light, soft contact shadows under map and panorama, restrained heading shadow, button depth and highlighted rules. Open layout and natural-scale photo retained; no new containers, assets or JavaScript. Mobile/desktop screenshots and geometry checks, CSS build and diff checks passed. Local only.


Location/tour design refresh: added a compact location heading, unified address/contact/review footer with restrained star accent, matching typography and soft viewport shadows. Tour now has a small editorial kicker, a 360° heading, underlined Google link and a pill launch control with compass medallion. Preserved Google controls/attribution, facade start, activation/finish behavior and lazy loading. Real Google desktop/mobile screenshots, map layout checks and tour keyboard/geometry tests at 320/390/1440px passed, as did ESLint, TypeScript and CSS compilation. No deployment.
