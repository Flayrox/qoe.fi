# Test Infrastructure Documentation (`TEST_INFRA.md`)

## Overview
This document describes the testing architecture, environment configuration, test specifications, and execution instructions for the **Genius-Style Article Annotation Engine (`@qoe/ui/annotations`)** across `apps/web` (Tenant Creator Pages) and `apps/feed` (Feed Reader Drawers).

Per the Dual Track Architecture, the test suite is structured into four distinct coverage tiers using a combination of **Vitest (JSDOM environment)** for unit, DOM Range TreeWalker, and component contract testing, and **Playwright** for end-to-end (E2E), layout boundary, and micro-interaction verification.

---

## Test Suite Organization

```
/Users/ephe/Desktop/Qoe.fi/dev/prod/qoe.fi/
├── packages/ui/src/annotations/__tests__/
│   ├── package-exports.test.ts            # Tier 1: Subpath exports & contract verification
│   ├── tree-walker-highlighting.test.ts   # Tier 1 & 2: TreeWalker DOM mark creation & styling
│   ├── component-rendering.test.ts        # Tier 1: Component rendering & decoupled action callbacks
│   ├── boundary-corner-cases.test.ts      # Tier 2: Empty content, XSS escaping & boundary conditions
│   └── cross-feature-combinations.test.ts # Tier 3: 1/N pagination, spotlight pulse & comment threads
└── e2e/
    └── annotations.spec.ts                # Tier 4: Feed Reader Drawer (94vh + left-64), Tenant accent & Rauno physics
```

---

## Testing Tiers & Coverage

### Tier 1: Feature Coverage
- **Package Exports**: Validates `packages/ui/package.json` exports `./annotations` mapping to `./src/annotations/index.ts` and exported components (`TextHighlighter`, `AnnotationSideDrawer`, `TextSelectionPopover`).
- **TreeWalker DOM Mark Creation**: Verifies DOM Range scanning and `<mark>` wrapping logic:
  - **Author Highlights**: Amber line styling (`bg-amber-500/20 text-foreground border-b border-amber-500`).
  - **Public Genius Highlights**: Primary line styling (`bg-primary/20 text-foreground border-b border-primary/50`).
  - **Private Reader Notes**: Dashed line styling (`bg-amber-500/15 text-foreground border-b border-dashed border-amber-400/60`).
- **Component Rendering & Action Callbacks**: Validates decoupled action callbacks (`onHighlightCreate`, `onUpvote`, `onComment`, `onTogglePrivacy`, `onDelete`, `onUpdateNote`, `onCrosspost`).

### Tier 2: Boundary & Corner Cases
- **Empty & Whitespace Content**: Handles empty content strings or whitespace-only nodes gracefully without throwing errors.
- **XSS & Encoding Safety**: Confirms text containing quotes, HTML entities, and `<script>` tags are rendered as plain text within DOM `<mark>` elements without executing code.
- **Missing Optional Callbacks**: Guarantees zero runtime crashes when optional callback handlers are omitted.
- **Public Annotation Restrictions**: Enforces author privacy controls when `allowPublicAnnotations` is false.
- **Anonymous Reader Fallbacks**: Verifies default fallback names (`Lecteur`) when reader profiles are null.

### Tier 3: Cross-Feature Combinations
- **Sequential Pagination (1 / N)**: Verifies next/previous navigation switching, keydown arrow listeners (Left/Right), and boundary clamping at index 0 and N-1.
- **Spotlight Pulse Ring**: Confirms active mark glow animation classes (`ring-2 ring-primary/80 bg-amber-500/40 shadow-lg shadow-amber-500/30`) applied when focused.
- **Comment Threads & Crossposting**: Validates nested discussion thread interactions and quote-to-feed crossposting.
- **Deterministic Highlight Sorting**: Validates multi-level sorting logic: DOM start offset -> end offset -> length -> creation date.

### Tier 4: Real-World E2E Scenarios (Playwright)
- **Feed Reader Drawer Layout (apps/feed)**: Verifies `h-[94vh]` drawer panel height and `md:left-64` sidebar boundary preserving the navigation bar.
- **Scroll Lock & ESC Listener**: Confirms `document.body.style.overflow = "hidden"` during drawer lifecycle and restoration on ESC.
- **Tenant Creator Page Compatibility (apps/web)**: Verifies `--tenant-accent` CSS custom variable inheritance and server-side paywall compatibility (`sliceContentAtPaywall`).
- **Rauno Freiberg Morphing Surface**: Validates selection toolbar `layoutId="rauno-morphing-surface"` with spring physics (`stiffness: 500, damping: 32`).

---

## Test Execution Commands

### 1. Run Unit & DOM Component Suite (Vitest)
```bash
npx vitest run
```
To run specifically the annotation test files:
```bash
npx vitest run packages/ui/src/annotations/__tests__/
```

### 2. Run E2E & Layout Boundary Suite (Playwright)
```bash
npx playwright test e2e/annotations.spec.ts
```

---

## Environment & Dependency Requirements
- Node.js >= 20
- Vitest 4.x (with JSDOM environment)
- Playwright 1.x
