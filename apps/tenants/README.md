# `apps/tenants` (Tenant Engine)

**Role:** The multi-tenant reading engine for creators. It dynamically routes subdomains to specific publications and handles paywalled content resolution without exposing sensitive AST nodes.

## Core Mechanisms

- **Routing:** Handled gracefully via `middleware.ts` which decodes `[domain]` and resolves the matching media record.
- **Security:** Evaluates Stripe subscriptions on the server before dispatching rendering.

## File Exhaustive Listing

- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `middleware.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/robots.ts`
- `src/app/sitemap.ts`
- `src/app/api/articles/upload/route.ts`
- `src/app/auth/sso/callback/route.ts`
- `src/app/tenant/[domain]/layout.tsx`
- `src/app/tenant/[domain]/page.tsx`
- `src/app/tenant/[domain]/actions/subscribe.ts`
- `src/app/tenant/[domain]/articles/[slug]/page.tsx`
- `src/app/tenant/[domain]/article/[slug]/page.tsx`
- `src/app/tenant/[domain]/article/[slug]/actions.ts`
- `src/app/tenant/[domain]/article/[slug]/AnnotationSideDrawer.tsx`
- `src/app/tenant/[domain]/article/[slug]/ArticleCommentsSection.tsx`
- `src/app/tenant/[domain]/article/[slug]/PaywallCut.tsx`
- `src/app/tenant/[domain]/article/[slug]/ReaderActions.tsx`
- `src/app/tenant/[domain]/article/[slug]/TextHighlighter.tsx`
- `src/components/paywall/PaywallCut.tsx`
- `src/lib/sanitize.ts`
