# Project: qoe-annotation-engine

## Architecture

- Monorepo package structure `@qoe/ui/annotations` in `packages/ui/src/annotations/`.
- Consumers: `apps/web` (Tenant Creator Pages) and `apps/feed` (Feed Reader Drawers).
- Shared component interface: decoupled action callbacks (`onHighlightCreate`, `onUpvote`, `onComment`, `onTogglePrivacy`, `onUpdateNote`, `onDelete`, `onCrosspost`).

## Code Layout

- `packages/ui/src/annotations/types.ts`: Annotation types & callback interfaces
- `packages/ui/src/annotations/TextHighlighter.tsx`: TreeWalker DOM range highlighter & Rauno morphing surface
- `packages/ui/src/annotations/TextSelectionPopover.tsx`: Floating UI range popover wrapper
- `packages/ui/src/annotations/AnnotationSideDrawer.tsx`: Sequential drawer panel (1 / N) & spotlight ring
- `packages/ui/src/annotations/index.ts`: Package entry point
- `packages/ui/package.json`: Add `./annotations` export path
- `apps/feed/src/components/social/ArticleReaderDrawer.tsx`: Feed reader bottom-sheet integration
- `apps/feed/src/components/social/ArticleAnnotatorView.tsx`: Refactored feed annotator view
- `apps/web/src/app/tenant/[domain]/article/[slug]/page.tsx`: Tenant article page consuming `@qoe/ui/annotations`

## Feature Inventory

| #   | Feature                                   | Description                                                                                                                                                           | Milestone | Source |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| 1   | Package Exports                           | Add `./annotations` subpath export in `packages/ui/package.json`                                                                                                      | M1        | R1     |
| 2   | Decoupled Types & Callbacks               | Define `AnnotationActionCallbacks`, `AnnotationItem`, `CommentItem`                                                                                                   | M1        | R1     |
| 3   | Shared TextHighlighter & Morphing Surface | Decouple `TextHighlighter`, TreeWalker mark styling (amber, primary, dashed), Rauno morphing surface (`layoutId="rauno-morphing-surface"`, stiffness 500, damping 32) | M1        | R1     |
| 4   | Shared AnnotationSideDrawer               | Decouple `AnnotationSideDrawer`, (1 / N) pagination, arrow nav, spotlight pulse ring, comment threads                                                                 | M1        | R1     |
| 5   | Package Entrypoint                        | Re-export all annotation components & types in `packages/ui/src/annotations/index.ts`                                                                                 | M1        | R1     |
| 6   | Feed Reader Drawer Refactoring            | Integrate `@qoe/ui/annotations` into `ArticleReaderDrawer` & `ArticleAnnotatorView`                                                                                   | M2        | R2     |
| 7   | Feed Boundary & Layout Verification       | Verify 94vh height, `md:left-64` boundary, and sidebar non-interference                                                                                               | M2        | R2     |
| 8   | Tenant Page Integration                   | Refactor `apps/web` tenant article page to consume `@qoe/ui/annotations`                                                                                              | M3        | R3     |
| 9   | Tenant Accent & Paywall Compatibility     | Preserve `--tenant-accent`, server paywall `sliceContentAtPaywall`, and clean up duplicate files in `apps/web`                                                        | M3        | R3     |

## Milestones

| #   | Name                                           | Scope                                                                                                                                     | Dependencies | Status  |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------- |
| 1   | Package Extraction (`@qoe/ui/annotations`)     | Create `packages/ui/src/annotations/`, types, `TextHighlighter`, `AnnotationSideDrawer`, `TextSelectionPopover`, export in `package.json` | none         | DONE    |
| 2   | Feed Reader Integration (`apps/feed`)          | Integrate `@qoe/ui/annotations` into `ArticleReaderDrawer` and `ArticleAnnotatorView` in `apps/feed`                                      | M1           | PLANNED |
| 3   | Tenant Page Integration & Cleanup (`apps/web`) | Integrate `@qoe/ui/annotations` in `apps/web`, remove local duplicates, verify `--tenant-accent` and paywall                              | M1           | PLANNED |
| 4   | Final E2E & Adversarial Hardening              | Run build, unit tests, E2E test track, adversarial checks, forensic audit                                                                 | M1, M2, M3   | PLANNED |

## Interface Contracts

### `@qoe/ui/annotations` ↔ Consumers (`apps/web`, `apps/feed`)

- Exported components: `TextHighlighter`, `AnnotationSideDrawer`, `TextSelectionPopover`
- Exported types: `AnnotationItem`, `CommentItem`, `AnnotationActionCallbacks`
- `TextHighlighterProps`: `{ highlights, currentUserId, callbacks, isAuthor, containerId, ... }`
- `AnnotationSideDrawerProps`: `{ isOpen, onClose, highlights, activeHighlightId, callbacks, currentUserId, ... }`
