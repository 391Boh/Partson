---
version: 1
slug: home-pickers
primary_target: app/components/HomePickerHeading.tsx
related_targets: [app/components/Auto.tsx, app/components/tovar.tsx, app/components/Brands.tsx, app/globals.css]
---

# Homepage product selection

Mode: Operate within the established PartsON homepage. The user explicitly chose three separate sections with one coherent design, rather than a tabbed combined picker.

Inherit the existing Ukrainian copy, display font, ink/blue/teal palette, authentic vehicle and manufacturer logos and category illustrations. Use the same left introduction/search rail and right results area on desktop; introduction and controls precede results on phones. Preserve car → model → modification, category hierarchy, manufacturer details, pagination, search, public links and lazy section loading.

Keep titles and search triggers consistent. Put readable names beneath logos. Restore the existing background artwork, as explicitly requested in the latest user instruction: navy vehicle silhouettes, light photographic parts, deep teal manufacturer marks. Make the scenes expressive while keeping a coherent structure and readable white cards. No continuous background motion, new fonts or scroll animations. Homepage-only CSS preserves the shared catalog flows. Retain visible keyboard focus and stable virtual-page heights. The common heading lives in HomePickerHeading; semantic home-picker classes own the scoped styles.

Latest refinement (local only, do not deploy): reduce empty height, vertically align the vehicle list with the search rail, use a common right-hand navigation column for vehicle makes/models/manufacturers/categories, translucent gradient cards, and lighter blue/ice/mint backgrounds. Recolour existing SVG masks and fade existing parts photos with CSS rather than generating replacement logos or photography. Preserve static artwork and the map scroll fix.

Latest steering: keep local-only. Replace the right-hand control column with arrows flanking both sides of every list and a simple centred page count beneath it. Distinguish backgrounds with blue diagonal, ice upward-diagonal, and mint reverse-diagonal gradients plus faint real material crops from existing automotive photographs. No animated texture or synthetic grain.

Current local refinement: use bare chevrons without circle, border, background or shadow. Keep the 44px hit areas and focus outlines. Place the counter label before its values at the left of one footer row, and the existing all-items link at the right; add a real all-models link via buildAutoBrandPath. Preserve backgrounds from the previous iteration.

Current footer alignment: left “Доступно” plus the actual filtered item count, exactly centred current/total pages, right all-items link. Use equal flexible side tracks around the page value, including models. Local-only remains in force.

Latest local refinement: put each search control in the results column immediately above the list it filters. Keep headings, steps, description and vehicle year selection in the introduction rail. Style trigger/expanded field as one compact 48px control. Availability must name its entity with Ukrainian plural forms (car makes, models, manufacturers, categories/groups); retain exact centred page values and right all-items links.

Current steering (still local-only): replace the always-visible top search bar with a compact Search button sharing the page-controls/all-items footer row. Expand the input above the list only after activation. Keep availability once as the small metadata row above those controls. Models use the same compact action via an optional onOpenSearch callback; preserve catalog embeds.

Latest steering: one clear toolbar ABOVE every list, with compact search at left, centred page values, all-items link at right. Search morphs into its input in the same slot; on narrow screens expand the field to the next full-width toolbar row. Use a portal into the toolbar slot to retain shared input behavior. Keep availability only beneath cards. Preserve queries if empty results temporarily remove the toolbar slot. Local-only, no deployment.

Toolbar refinement: availability and entity count sit above the directory link on the upper right. Pages remain centered. Search button/input use the same width (240px desktop, full row mobile), preventing layout jumps on activation. Preserve this responsive grouping and local-only status.

Typography refinement: top-align introduction rails with results. Keep balanced 26–32px display headings, a thin underline beneath colored title words, and readable 14px descriptions (43ch desktop). Distinct accents are blue for vehicles, cyan for categories, green for makers; carry them into search, year fields, availability and directory links. Preserve content and current local-only workflow.

Current hierarchy: headings 28–36px (26px ≤360px), descriptions 15px with generous line height and 20px separation. Directional soft shadows create depth on search/year controls, active steps and translucent list cards. Keep bare side arrows and no continuous motion. Heading selectors must outrank the global site h2 scale.

Toolbar readability: current page is 20px (18px on narrow phones), search has a white icon on the section accent, directory links are 13px desktop / 11–12px mobile. Mobile availability is a right-aligned two-line label/value above its directory link; reserve 56px beside centered pages to prevent long manufacturer units overlapping the link.

Latest steering: merge availability and the all-items link into one single-line directory link, retaining the all-items name for screen readers. Align toolbar to actual card edges inside the side arrows. Desktop toolbar is search/pages/summary; mobile has pages+summary, then full-width search. Preserve local-only status.

Background artwork now has stronger logo/parts contrast at the user's request: blue vehicle marks ×2.2 base opacity, green manufacturer marks ×2.3, category parts ×3.4. Keep the copy-side veil and all backgrounds static.

Background placement now uses isolated proportional slots, desktop rows and mobile edge pairs, with unrotated boxes and real gaps. Disable the oversized material-photo pseudo-layer to avoid image-on-image overlap. Stronger artwork opacity remains. Verified zero pairwise intersections at 320/390/768/1440px; local-only.

Latest visual steering: irregular rather than aligned background artwork. Use per-image --art-x/y/w/h/angle variables with separate mobile compositions. Keep varied size and tilt, preserved visibility, static rendering and zero image intersections. Supersedes the earlier uniform-slot arrangement.

List-card transparency uses layered directional gradients, with a denser tinted lower wash for text and clearer upper/side areas revealing background artwork. Preserve full text/logo opacity. Section-specific angles/tints and brighter hover/selected highlights; no backdrop blur.

Category cards now prioritize larger artwork (104px desktop, 88px mobile), a steady image zone and aligned captions/count badges. Group photo previews fill that zone and keep full-width captions, with the arrow below rather than squeezing the name. Preserve gradient transparency and local-only status.

Category correction: root category icons stay compact at 56px; retain larger photos for product groups only. Reverse this section's split: list first/left, heading and description after/right, with matching DOM order. Other pickers keep their previous arrangement. Local-only.

Groups must match category card height (152px desktop / 144px mobile). Reserve photo/caption rows, including while photos load or are missing, plus fixed toolbar/back-navigation space. Category→group transitions must keep the list, introduction and section geometry stable. Preview photo zones are 76px desktop / 70px mobile.

Latest alignment: vertically centre introduction rails relative to the list layout at ≥768px. Keep mobile stacking and the category list-first arrangement; supersedes earlier top alignment.

Group/subgroup cards use one full-width grid column: centered photo well, two-line left-aligned caption, count below, arrow at bottom right. Keep reserved geometry when a photo is unavailable, and preserve existing compact card heights and stable transitions.

User-requested hover exception to static scene styling: backdrop images have a subtle 0.9px blur, sharpening on hover/focus, with a short gradient crossfade/position shift. Never blur content/cards, move the images, or add looping animation. Disable transitions for reduced motion; preserve non-overlapping scatter and local-only status.

Current polish: common section-colored elevation, focus and hover states; 12px blending seams and 24px section padding. Keep source order, centered introduction rails, compact category/group geometry, background hover effect and local-only restriction. H2/copy now explicitly describes selection by make/model, category hierarchy and manufacturer, with actual dynamic counts and concise Ukrainian terminology. Do not add unsupported commercial or SEO ranking claims.

Search trigger is now the prominent primary action: section-colored gradient, white text/icon, compact inset icon tile and desktop chevron. Expanded field stays light and has identical dimensions. Preserve small-phone fit and visible keyboard focus.

Search button gradient now has 14–22% transparency, with darker section tints preserving white-label contrast. Hover makes the background slightly denser; text and icons remain fully opaque.

Vehicle final steps: blue translucent modification choices and confirmation summary, compact specs, aligned saved-car rows and matched primary/secondary actions. Use two-column modification choices on phones. Hide model search in engine/confirmed stages; completed summary shows a concise catalogue prompt instead of repeated year controls/instructions. Section top padding is 32px (bottom remains24px). Local-only.

Vehicle picker geometry is now fixed per breakpoint (400px desktop results; 320px intro + 460px results on mobile). Keep dimensions stable across brand/model/modification/summary, with internal overflow for long content and mobile results aligned to start. Selected title contains make/model/year only, details once as badges. Keep accessible remove-current/remove-saved actions and persistence regression coverage.

Current typography: crisp dark headings up to 38px desktop / 28px mobile (26px narrow), 3px section-color underlines, no diffuse heading shadow. Descriptions use darker 15px text and clear phrase emphasis. Preserve fixed vehicle-step geometry and vertical centering.

Editorial copy now uses distinct intent-led H2s: “Запчастини за маркою та моделлю”, “Каталог запчастин за категоріями”, “Виробники автозапчастин”. Keep descriptions concrete, concise and tied to real controls; counts must use correct Ukrainian plurals. Preserve H1/metadata, layout and local-only scope. No keyword stuffing, invented claims or ranking guarantees.

Vehicle navigation refinement: step controls are 58px desktop / 66px mobile with clearer title-case labels, larger step markers and mobile vertical stacking. Preserve fixed picker heights and accessible active/disabled/focus states. Homepage SEO/popular section design is documented in home-bottom.md.


Performance update: backdrop markup ships with each deferred picker, without nested dynamic imports or intersection gates. `home-backdrop-assets.ts` starts low-priority image decoding in parallel with that picker's code (bounded to 1.8 seconds so decorative failures do not block controls). Keep asset lists aligned with the three backdrop components. Artwork is static CSS with no JavaScript layout reads or resize observers. The near-section queue uses DOM readiness plus idle time and does not wait for third-party window.load. Preserve the 800px proximity limit, 220ms commit spacing, 484px desktop and 860px mobile section reservations. Do not eagerly mount every offscreen picker.

Vehicle navigation refinement: homepage make/model/modification steps now stack as full-width 50px rows at ≥768px, with 88px horizontal tiles on phones. Active steps use a dark blue/teal gradient and light text; completed steps use teal and a check (or the chosen make's logo); unavailable steps keep readable tinted labels. Keep original step behavior, stable section geometry, fixed-height results, bare pagination arrows and existing mobile footer controls. Make cards use a clearer ice-white wash and readable wrapping names, with compact 11px labels at tablet widths. Search follows the active step's darker accent. Local-only remains in force.

Year in the results column (approved for deploy, supersedes "vehicle year selection in the introduction rail" and local-only): the model step has a "Рік" chip strip (Усі роки + years, newest first) above the list, aligned to card edges, masked edge fades and bare chevrons; the modification step starts with year tiles (4×3 desktop, 3 columns on phones) labelled "Рік випуску", then volume/power/gearbox/drive. Selected year chips use the active-step gradient. The catalog filter variant keeps its select.
