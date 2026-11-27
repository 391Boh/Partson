---
version: 1
slug: home-new-arrivals
primary_target: app/components/HomeNewArrivalsBanner.tsx
related_targets: [app/components/FadeInOnLoad.tsx, app/components/HomeArrivalBackdropMotion.tsx, app/globals.css]
---

# Homepage "Нове надходження" banner

Loading without flicker or jumps (27.11): no `content-visibility` (its intrinsic-size guess made the block resize as it entered the viewport). Lazy group thumbnails and the floating desktop products are wrapped in FadeInOnLoad: only images still loading at mount get `data-fade="pending"` (opacity 0) and fade in over 520 ms on load; decoded images are never hidden, and without JS they simply show. The drift-animation selectors target `.home-arrival-decor > .contents > picture` because of that wrapper. Verified: CLS 0 on cold loads (desktop and phone), card images visible after load.
