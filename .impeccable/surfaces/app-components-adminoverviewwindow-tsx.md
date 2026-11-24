---
version: 1
slug: "app-components-adminoverviewwindow-tsx"
primary_target: "app/components/AdminOverviewWindow.tsx"
related_targets: ["app/components/AdminOverview.tsx","app/components/LayoutHost.tsx","app/components/AdminChatPanel.tsx","app/lib/use-admin-window-drag.ts","app/components/AdminWindowResizeHandles.tsx"]
---

## Scope

Mode: Operate. Existing PartsON admin tools, extracted Overview window and shared desktop window controls. Local extension, no visual identity replacement. Ukrainian interface; authenticated APIs remain authoritative.

## Direction contract

THESIS: Give administrators direct access to store health and actionable orders through the existing floating tool stack.

OWN-WORLD: Inherit navy admin surfaces, cyan keyboard focus, compact controls and drawn Lucide icons. The icon-only cyan shortcut matches the gradient, dimensions and rounded corners of adjacent admin tools. Amber remains inside the Overview content.

STORY: Open Overview above +, inspect sales periods and outstanding orders, then open an order or callback list. Catalog quality, missed searches, NP refresh and CSV export remain available.

FIRST VIEWPORT: Independent nonmodal window below the header, up to 880px wide. Three tabs, refresh actions, period strip, attention orders, then revenue chart. Remaining information scrolls internally; mobile stays docked.

FORM: User-specified local extension of an existing floating window and existing Overview sections. Code-led; no concept seed or comp applies. Desktop edges/corners resize; title bars move; Home restores.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Quality bar

Preserve the incumbent admin system. Use real API figures and actions, readable compact hierarchy, accessible keyboard controls, bounded geometry and mobile insets. No shipping raster assets. Existing missing DESIGN.md is reported as pre-existing drift; this ordinary extension does not create or replace its system.

## Implementation evidence

- Checked `AdminOverviewWindow.tsx`, `AdminOverview.tsx`, `LayoutHost.tsx`, `AdminChatPanel.tsx`, shared resize handles and drag hook, `app/globals.css`, and `PRODUCT.md`. Overview inherits the code-defined navy admin surfaces, sky focus treatment, rounded compact controls, Lucide icons and global Exo 2 UI stack. The icon-only cyan shortcut above the violet + follows the neighboring gradient buttons; its accessible name and tooltip retain discoverability.
- Observed hierarchy: 16px window title, 13px section titles, 12px controls and period labels, 10–11px secondary text, and 16–23px period amounts. The 16px window shell and 12px content sections retain the incumbent rounded, layered admin character while reducing decorative density locally.
- Independent nonmodal window uses internal scrolling, sticky three-tab navigation and a desktop width up to 880px. At 768px and above, shared edge/corner controls resize and title bars move; arrows and Home provide keyboard adjustment and restoration. Mobile returns to docked geometry and hides resize controls.
- Inspected final `.impeccable/review/desktop.png`, `mobile.png` and `tablet.png`: actual components rendered with offline test figures, not production data or shipping artwork. The scoped mobile rule restores the 10px right content inset. Initial finish disposition was **fix**; final reviewer disposition is **ship**, with that finding resolved and no desktop/tablet regression.
- Task-owner validation: TypeScript, ESLint, `scripts/test-admin-overview.mjs`, `scripts/test-admin-window-drag.mjs`, product-edit regression with resizing and preserved data, style splitting, and production CSS build passed. Overview tests at 390/768/1440px use the real `AdminChatPanel` to open the correct expanded order and callbacks; token handling, NP sync, CSV and retry also pass. Production figures still come from authenticated APIs; fixture values supply review evidence only.
- Pre-existing documentation drift: root `DESIGN.md` and `.impeccable/design.json` are absent. This ordinary extension preserves that boundary; neither was created, and global design documentation completeness is not claimed. No shipping raster assets were added for this surface.

- Shortcut refinement: removed visible text, centered a 24px white Lucide chart icon, aligned 44/48px sizing and 15/16px corners with adjacent tools, and adopted the existing cyan/navy gradient with hover, pressed, expanded and keyboard-focus states.
