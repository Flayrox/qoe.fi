# `apps/dashboard` (Creator Studio)

**Role:** The dedicated SaaS interface for platform creators (`studio.qoe.fi`). Includes rich editing, Stripe billing management, and analytics insights.

## Core Mechanisms

- **Tiptap Editor:** Custom extensions (`PaywallDivider`) allow granular control over premium content cutoff limits.
- **Analytics:** Connects to `@qoe/analytics` to pull historical and geographic metrics.

## File Exhaustive Listing

_(Partial listed here for brevity, see tree for full structure including `src/app/(creator)/...`)_

- `package.json`
- `next.config.ts`
- `middleware.ts`
- `src/app/(creator)/*`
- `src/features/editor/components/Editor.tsx`
- `src/features/editor/extensions/PaywallDivider.ts`
