---
version: 1
slug: "home-hero-bonuses"
primary_target: "app/components/HeroAccountClient.tsx"
related_targets: ["app/components/hero.tsx","app/components/LazyHeroAccountClient.tsx","scripts/test-home-auth-layout.mjs"]
---

# Hero greeting and bonus introduction

Mode: Persuade. Existing PartsON hero/account panel, simplified at the user's request. Keep the established Exo 2 font, dark blue surface, mint action and existing authentication/profile behavior.

Initial state: greeting, one brief paragraph about discounts, partnership and vehicle selection, plus “Переглянути бонуси”. Guests see a mint gift icon in a softly tinted rounded square beside “Бонуси та переваги”. The panel has a quiet blue/teal gradient, compact spacing and one full-width primary action. Signed-in visitors retain their personal greeting/avatar and saved profile. The panel does not render sign-in, registration or their invitation/footer for guests, including during auth restoration. Other action-only uses of the account component retain their existing authentication controls. The saved-profile footer remains available for signed-in visitors.

Activation replaces the greeting/icon and description with the four existing actionable benefits within the same fixed area. The button becomes “Сховати бонуси” and reverses the transition. The grid tracks are 56/92/44px with two 12px gaps; the bonus list spans the first two tracks, 160px total, and uses two 76px rows separated by 8px. No height, max-height, margins or button width animate. The full-width toggle stays on the third track in both states, aligned to both content edges. Guest panel height is 250px on narrow screens and 274px on the reviewed wide homepage; surrounding sections and the button stay stationary throughout the transition.

The outgoing intro fades and moves slightly left; incoming bonuses reveal with a soft clipped crossfade and a short right-to-center movement. Native transitions reverse cleanly on repeated activation. The gift tile is 56px with a 34px desktop / 32px mobile SVG. Its center aligns with the heading. Compact cards retain meaningful titles and the partnership discount hint. Other supplementary hints remain in each button's accessible name, including the discount figure and eligibility context. Existing destinations, eligibility checks and percentages remain unchanged.

The disclosure uses a stable useId, aria-expanded/aria-controls, inert and aria-hidden on the inactive greeting, intro and benefit list. Native button activation supports keyboard and touch; focus remains on the toggle. Reduced motion removes transitions. No new dependencies, images, network calls or autonomous animation. The guest gift reacts to hover/focus with one finite interaction animation, not an autonomous loop.

Validation: Chrome review at 320, 390 and 1440px for closed/open states; shared authentication layout fixture covers 320–1440px, keyboard reveal/hide, guest/user restoration, late profile delivery and a compact guest panel with no authentication placeholders, no login/register buttons, and stable saved-profile geometry after user restoration. Local captures: output/hero-bonus/.

Icon/layout refinement validated at 320, 390 and 1440px on the live homepage; authentication fixture passes at 320, 390, 768, 1024 and 1440px. TypeScript, targeted ESLint and production CSS compilation pass. New captures: output/hero-bonus-icon/.

Compact fixed-layout review: output/hero-bonus-compact/. Browser checks at 320, 390 and 1440px compare panel height, button position/width and the following section before, during and after opening/closing; all remain identical. Authentication fixture also asserts no opening shift across 320–1440px. Production CSS compilation, ESLint and whitespace checks pass.

## Translucency and interaction finish

The surface gradient now uses 72%/82% dark-color opacity so the existing hero photograph shows through while text stays opaque. Pointer hover and focus gently tint the background, brighten the border and add soft downward depth without translating/scaling the panel. The icon frame and primary action receive matching mint emphasis. On fine-pointer devices with motion enabled, the gift SVG performs one 700ms rocking gesture on hover/focus; scrolling suppresses it, touch has no sticky hover, and reduced motion removes it. Existing personalized profile cover layers remain intact.

Verified on the live homepage: 1440px hover, 320px touch and 1440px reduced motion. Computed alpha, finite icon iteration, reduced-motion absence and exact geometry before/during/after interactions pass; the 320–1440px authentication/disclosure fixture also passes. Captures: output/hero-bonus-hover/.

Alignment finish: heading and enlarged icon share a vertical center, while the icon frame, description and full-width CTA share the same left edge. CTA and description also share the right edge. Redistributed fixed tracks preserve the original panel height and transition geometry. Verified exact computed alignment and no opening shift at 320/390/1440px; the authentication fixture passes through 1440px. Captures: output/hero-bonus-align/.

## Signed-in without layout shift (27.11)

The saved car and VIN render inside the intro's fixed 92px track (HeroSavedProfile `compact`, two 40px rows); the separate 128px profile area under the card is gone. Guest, loading and signed-in cards have identical heights (274px desktop, 250px phone), so signing in no longer pushes the page. Delivery stays in the account window.
