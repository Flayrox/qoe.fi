# 🔬 Deep Architectural & Codebase Audit

## Pass 1: Architecture & Routing

- [admin] Redirections in middleware might not be using absolute URLs properly. Check `NextResponse.redirect` usage.
- [dashboard] Redirections in middleware might not be using absolute URLs properly. Check `NextResponse.redirect` usage.
- [feed] Redirections in middleware might not be using absolute URLs properly. Check `NextResponse.redirect` usage.
- [web] Redirections in middleware might not be using absolute URLs properly. Check `NextResponse.redirect` usage.
- [caddy] Security headers (HSTS, X-Frame-Options) might be missing from Caddyfile.
- [apps/dashboard/src/app/layout.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/dashboard/src/lib/analytics.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/dashboard/src/lib/moderation.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/dashboard/src/lib/supabase/server.test.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/dashboard/src/lib/supabase/client.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/dashboard/src/lib/supabase/server.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/api/src/index.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/web/src/middleware.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/web/src/app/layout.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/web/src/app/auth/sso/callback/route.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/landing/src/app/layout.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/components/social/MicroPostCard.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/app/layout.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/app/(reader)/home/components/HomeWidgets.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/app/(reader)/home/components/ArticleCard.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/app/(reader)/highlights/page.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/app/(reader)/library/LibraryClient.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/app/api/upload/route.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/app/auth/sso/sync/route.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/app/auth/callback/route.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/lib/analytics.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/lib/supabase/server.test.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/lib/supabase/client.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/feed/src/lib/supabase/server.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/admin/src/app/layout.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/admin/src/app/(admin)/admin/actions.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/admin/src/app/(admin)/admin/layout.tsx] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/admin/src/lib/analytics.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/admin/src/lib/supabase/server.test.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/admin/src/lib/supabase/client.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.
- [apps/admin/src/lib/supabase/server.ts] Uses raw `process.env` instead of `@qoe/config` validated envs.

## Pass 2: Data Layer, Types & Security

- [packages/config/src/env.ts] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [packages/ui/src/TenantHeader.tsx] Contains 8 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [packages/supabase/src/cookie-config.ts] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/dashboard/src/components/feed/ArticleCard.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/dashboard/src/components/feed/PublicFeedPreview.tsx] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/dashboard/src/components/layout/Footer.tsx] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/dashboard/src/app/layout.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/dashboard/src/app/(creator)/articles/articles-client.tsx] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/dashboard/src/features/settings/components/settings-client.tsx] Contains 3 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/dashboard/src/lib/analytics.ts] Contains 4 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/dashboard/src/lib/supabase/server.test.ts] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/landing/src/components/landing/ProductPreview.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/feed/src/components/feed/ArticleCard.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/feed/src/components/layout/Footer.tsx] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/feed/src/app/layout.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/feed/src/app/(reader)/home/components/LoginModal.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/feed/src/app/login/actions.ts] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/feed/src/lib/analytics.ts] Contains 4 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/feed/src/lib/supabase/server.test.ts] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/components/feed/ArticleCard.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/components/feed/PublicFeedPreview.tsx] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/components/layout/Footer.tsx] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/app/layout.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/app/(admin)/admin/actions.ts] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/app/(admin)/admin/components/AdminSidebar.tsx] Contains 4 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/app/(admin)/admin/widgets/components/WidgetsCMS.tsx] Contains 1 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/lib/analytics.ts] Contains 4 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.
- [apps/admin/src/lib/supabase/server.test.ts] Contains 2 unsafe `as any` type cast(s). Replace with proper typing or Zod validation.

## Pass 3: Performance, UI & Code Smells

### Code Smells & Boundaries
- [apps/dashboard/src/components/ui/Logo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/hover-card.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/dropdown-menu.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/separator.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/period-select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/popover.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/table.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/sonner.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/time-picker-demo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/label.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/AnimatedBentoCard.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/avatar.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/tooltip.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/sheet.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/time-picker/period-select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/ui/time-picker/time-picker-demo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/layout/MainContentWrapper.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/layout/DashboardComponents.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/layout/ReaderPageLayout.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/components/layout/Navbar.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/dashboard/src/features/dashboard/components/SidebarMenuClient.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/landing/src/components/landing/CTA.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/landing/src/components/landing/ComparisonTable.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/landing/src/components/landing/TrustedCreators.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/landing/src/components/landing/BentoFeatures.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/Logo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/hover-card.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/dropdown-menu.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/separator.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/period-select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/popover.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/table.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/sonner.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/time-picker-demo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/label.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/AnimatedBentoCard.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/avatar.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/tooltip.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/sheet.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/time-picker/period-select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/ui/time-picker/time-picker-demo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/layout/MainContentWrapper.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/layout/ReaderPageLayout.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/feed/src/components/layout/Navbar.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/Logo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/hover-card.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/dropdown-menu.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/separator.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/period-select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/popover.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/table.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/sonner.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/time-picker-demo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/label.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/AnimatedBentoCard.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/avatar.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/tooltip.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/sheet.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/time-picker/period-select.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/ui/time-picker/time-picker-demo.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/layout/MainContentWrapper.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/layout/ReaderPageLayout.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/components/layout/Navbar.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/app/(admin)/admin/components/AdminHeader.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.
- [apps/admin/src/app/(admin)/admin/components/AdminSidebar.tsx] Marked as `"use client"` but doesn't seem to use any client-only React features. Consider making it a Server Component for better performance.

### Unresolved TODOs & FIXMEs (Technical Debt)
- [packages/ui/src/SubscribeForm.tsx] TODO/FIXME: Wire to real server action when tenant routing is implemented
- [apps/dashboard/src/lib/ai.ts] TODO/FIXME: implémenter avec @qoe/analytics ou package dédié
- [apps/feed/src/app/login/login-form.tsx] TODO/FIXME: brancher sur @qoe/i18n/setLanguage quand implémenté
- [apps/feed/src/lib/ai.ts] TODO/FIXME: implémenter avec @qoe/analytics ou package dédié
- [apps/admin/src/lib/ai.ts] TODO/FIXME: implémenter avec @qoe/analytics ou package dédié
- [AI_CODEBASE_MAP.md] TODO/FIXME: 4, userId },
- [apps/admin/src/features/editor/components/Editor.tsx] TODO/FIXME: re-enable when extension is wired
- [apps/feed/src/features/editor/components/Editor.tsx] TODO/FIXME: re-enable when extension is wired
- [packages/ui/src/SocialIcon.tsx] TODO/FIXME: return (
- [AI_CODEBASE_MAP.md] TODO/FIXME: 3, userId: dbUser.id },
- [apps/web/src/app/tenant/[domain]/article/[slug]/TextHighlighter.tsx] TODO/FIXME: HTMLElement, textToHighlight: string, note?: string) => {

## General Recommendations & Next Steps

1. **Middleware Fixes**: Review the `NextResponse.redirect()` calls in middlewares. Next.js 14+ often requires providing a full `URL` object instead of just a relative path, e.g., `NextResponse.redirect(new URL('/login', request.url))`.
2. **Remove Unused `"use client"` Directives**: A massive number of UI components in `apps/dashboard`, `apps/landing`, `apps/feed`, and `apps/admin` (like `hover-card.tsx`, `separator.tsx`, etc.) are marked with `"use client"` but don't actually use state, context, or browser APIs. Consider removing `"use client"` so they can render natively on the server and reduce JS bundle sizes, or verifying if shadcn/ui components genuinely need them (they often do if they use Radix primitives internally, so this needs careful manual review).
3. **Environment Variables**: Avoid using raw `process.env.VAR` throughout the apps. Route all environment variables through the `@qoe/config` package (which uses Zod for schema validation) to guarantee type safety and crash early on missing secrets.
4. **Caddyfile Security**: Consider adding explicit HTTP security headers (HSTS, X-Content-Type-Options, X-Frame-Options) in the Caddy reverse proxy to harden the deployment.
5. **Resolve Technical Debt**: Tackle the TODOs listed above, particularly wiring the `SubscribeForm` to a real server action and finishing the i18n implementation.

*This audit was automatically generated by Jules.*
