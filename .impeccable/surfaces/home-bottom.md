---
version: 1
slug: home-bottom
primary_target: app/components/AdvantagesSection.tsx
related_targets: [app/page.tsx, app/globals.css]
---

# Store overview and official map

Preserve PartsON typography and light teal/blue palette. Latest user direction replaces delayed map mounting: server-render the official Google Maps iframe with loading=eager, a reserved responsive height, interactive controls and a separate route link. Network readiness depends on Google; there is no click or viewport gate.

Use original shop photographs: storefront/photos/partson-store-1.webp and storefront/photos/bg/store-6.webp. Clear location introduction, compact assortment descriptions, three crawlable directory links, delivery, phone and VIN assistance. No invented claims. Popular groups section is removed from the homepage at user request; its component remains available elsewhere. Photos stay still during scrolling. Storefront and display photographs share a compact two-photo gallery above the assortment copy. Maintain explicit image heights at each breakpoint.

All changes remain local. No deployment authorized. scripts/test-home-map-scroll.mjs verifies eager iframe presence, stable geometry, working image assets, directory links, removed popular section and no horizontal overflow.

Store content is now visible directly in server HTML: the section wrapper has is-revealed without a hydration-dependent observer. Storefront photography uses the existing 768px responsive derivative on small screens. The official map retains eager loading as explicitly requested; it must not block catalogue preparation.


Latest layout: full-width editorial heading with short copy, then an equal-height location/assortment split. Desktop map is on the left, shop gallery and assortment on the right. Mobile reading order is copy then map. Help area uses the same light teal palette with one chat action and three native details/summary questions (selection, collection address, delivery). Keep answers factual and server-rendered, no extra accordion JavaScript or automatic animations. Opening a question may naturally expand its block after user input.
