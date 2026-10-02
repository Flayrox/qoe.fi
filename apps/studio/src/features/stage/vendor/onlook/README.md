# Stage — Vendor Onlook (référence brute, ne pas importer direct)

Contenu copié tel quel depuis `.reference/onlook` (`--depth 1`) pour portage souverain vers Qoefi Stage.

- `_components/canvas/` : math zoom/pan, frames, overlay rect/hover/click/resize, measurement, snap, drag-select, hotkeys
- `_components/editor-bar/` : dropdowns border/radius/padding/margin/display, inputs, text-inputs, hooks
- `_components/left-panel/design-panel/` + `left-panel/index.tsx` : layers-tree, brand, pages, images, windows, zoom-controls
- `_components/bottom-bar/`, `_components/top-bar/` : dock, breadcrumb, mode-toggle
- `store/editor/{engine,canvas,state,frames,history,overlay,snap}/` : managers mobx Onlook
- `LICENSE.ONLOOK.md` : attribution obligatoire, aucune marque en UI Stage

Règles :
1. Ne jamais importer ce dossier directement en prod (`tsconfig.exclude` l'ignore).
2. Porter lot par lot vers `stage/canvas|editor-bar|left-panel|engine/` avec shims (`@/components/store/editor` → `stage/engine`, `@onlook/*` → `@qoe/*`, `next-intl` → FR souverain).
3. UI finale 100% `Stage`, tokens `@qoe/theme`, micro-typo Inter 11px.
