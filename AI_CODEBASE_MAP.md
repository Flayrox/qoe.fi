# 🛡️ SYSTEM ARCHITECTURE & CODEBASE GROUND TRUTH

> **INSTRUCTION FOR AI AGENTS IN IDE:**
> Before writing or modifying any code in this repository, locate your target file in Section 3 and review its dependencies in Section 5 (Blast Radius). Always respect the architectural rules listed in Section 6.

---

## 1. Executive Overview & Stack Map
- **Core Purpose**: Multi-tenant creator platform (qoe.fi) with a decoupled architecture featuring a central reader feed, creator studio, superadmin dashboard, and custom-domain tenant blogs.
- **Exhaustive Tech Stack Matrix**:
  - **Framework**: Next.js 16 (App Router), Hono
  - **Language**: TypeScript 5.9
  - **State**: React State, Server Components
  - **UI**: shadcn/ui, Tailwind CSS
  - **Database**: PostgreSQL 16, pgvector, Redis
  - **ORM**: Prisma Client 6
  - **Auth**: Supabase (SSR clients)
  - **API Protocols**: REST (via Hono/Next API Routes)
  - **Build System**: Turborepo 2, pnpm workspaces, Docker
  - **Architectural Paradigm**: Monorepo, Feature-Sliced Design / Package-driven, Strangler Fig Pattern

## 2. Directory & Architecture Map
```text
qoe.fi/ (Root Monorepo)
├── apps/                  # Deployable Next.js/Hono applications
│   ├── admin/             # Superadmin dashboard (admin.qoe.fi) - CMS editing & global stats
│   ├── api/               # Hono backend API (api.qoe.fi) - Core API services
│   ├── dashboard/         # Creator studio (dashboard.qoe.fi) - TipTap editor & stripe analytics
│   ├── feed/              # Reader feed & central auth (qoe.fi) - SSO, bookmarks library
│   ├── landing/           # Public marketing site (start.qoe.fi) - GDPR, pricing, landing
│   └── web/               # Tenant blog engine (*.qoe.fi) - Ultra-optimized multi-tenant reader view
├── packages/              # Shared internal libraries (100% DRY)
│   ├── analytics/         # Tracking events (client/server)
│   ├── auth/              # Roles & permissions (`can(user, action)`)
│   ├── billing/           # Stripe integration & plans
│   ├── config/            # ENV validation (Zod) & global constants
│   ├── db/                # Singleton Prisma client, Schema, migrations, repositories
│   ├── i18n/              # Tolgee localization (server/client)
│   ├── supabase/          # Supabase SSR clients (browser, server, middleware)
│   ├── theme/             # Design tokens & color palettes
│   ├── tsconfig/          # Shared TypeScript configurations
│   ├── ui/                # Shared UI components (shadcn based)
│   └── utils/             # Helper functions (cn, slugify, etc)
├── workers/               # Async workers (BullMQ jobs)
├── docker/                # Shared Docker configuration & Caddyfiles
└── prisma/                # (DEPRECATED - moved to packages/db/prisma)
```


## 3. Exhaustive File-by-File Registry
*(Grouped by architectural layers: UI, Logic/Hooks, Data/API, Config/Utils, Types)*

| Relative Path | Main Responsibility | Key Exports | Key Imports / Dependencies | State / Side Effects |
| :--- | :--- | :--- | :--- | :--- |

## 3. Exhaustive File-by-File Registry
*(Grouped by architectural layers: UI, Logic/Hooks, Data/API, Config/Utils, Types)*

| Relative Path | Main Responsibility | Key Exports | Key Imports / Dependencies | State / Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `.env.docker.example` | Source File | - | - | - |
| `ACTIVATION.md` | Source File | - | - | - |
| `AI_CODEBASE_MAP.md` | Source File | - | - | - |
| `DEPLOYMENT.md` | Source File | - | - | - |
| `DEV.md` | Source File | - | - | - |
| `DOCKER.md` | Source File | - | - | - |
| `Dockerfile` | Source File | - | - | - |
| `GETTING_STARTED.md` | Source File | - | - | - |
| `HANDOFF.md` | Source File | - | - | - |
| `MIGRATION.md` | Source File | - | - | - |
| `README.md` | Source File | - | - | - |
| `apps/admin/middleware.ts` | Source File | config | @qoe/supabase/middleware, next/server | - |
| `apps/admin/next.config.ts` | Source File | - | next | - |
| `apps/admin/package.json` | Source File | - | - | - |
| `apps/admin/src/app/(admin)/admin/actions.ts` | Source File | - | next/cache, @qoe/db/client, @supabase/supabase-js, @qoe/supabase/server | - |
| `apps/admin/src/app/(admin)/admin/api/actions.ts` | Source File | - | next/cache, @qoe/db/client, @qoe/supabase/server | - |
| `apps/admin/src/app/(admin)/admin/api/components/api-requests-client.tsx` | Source File | ApiApplicant, ApiRequestsClient | react, framer-motion, sonner, ../actions | useState |
| `apps/admin/src/app/(admin)/admin/api/page.tsx` | Source File | - | react, ./components/api-requests-client, @qoe/db/client, lucide-react | - |
| `apps/admin/src/app/(admin)/admin/components/AdminHeader.tsx` | Source File | AdminHeader | @qoe/db/types, framer-motion, lucide-react | - |
| `apps/admin/src/app/(admin)/admin/components/AdminSidebar.tsx` | Source File | AdminSidebar | framer-motion, next/link, @qoe/utils, next/navigation | - |
| `apps/admin/src/app/(admin)/admin/components/AnalyticsOverview.tsx` | Source File | AnalyticsOverview | react, framer-motion, @qoe/utils | useState, useEffect |
| `apps/admin/src/app/(admin)/admin/components/CommandPalette.tsx` | Source File | CommandPalette | react, cmdk, next/navigation | useState, useEffect |
| `apps/admin/src/app/(admin)/admin/config/actions.ts` | Source File | - | @qoe/db/client, next/cache, @qoe/supabase/server | - |
| `apps/admin/src/app/(admin)/admin/config/page.tsx` | Source File | - | @qoe/db/client, ./actions, lucide-react | - |
| `apps/admin/src/app/(admin)/admin/frontend/actions.ts` | Source File | - | @qoe/db/client, next/cache, @qoe/supabase/server | - |
| `apps/admin/src/app/(admin)/admin/frontend/components/FrontendCMS.tsx` | Source File | FrontendCMS | react, @qoe/i18n, framer-motion, ../actions | useState, useEffect |
| `apps/admin/src/app/(admin)/admin/frontend/page.tsx` | Source File | - | ./components/FrontendCMS, @qoe/db/client | - |
| `apps/admin/src/app/(admin)/admin/layout.tsx` | Source File | - | ./components/AdminSidebar, react, @qoe/db/client, ./components/AdminHeader, next/headers, ./components/CommandPalette, @qoe/supabase/server, next/navigation | - |
| `apps/admin/src/app/(admin)/admin/page.tsx` | Source File | - | @qoe/db/client, ./components/AnalyticsOverview | - |
| `apps/admin/src/app/(admin)/admin/translations/TranslationCMS.tsx` | Source File | TranslationCMS | react, ../actions, lucide-react | useState |
| `apps/admin/src/app/(admin)/admin/translations/page.tsx` | Source File | - | ../../../../../../../messages/en.json, ../../../../../../../messages/fr.json, @qoe/db/client, ./TranslationCMS | - |
| `apps/admin/src/app/(admin)/admin/users/[id]/page.tsx` | Source File | - | lucide-react, @qoe/db/client, next/link, next/navigation | - |
| `apps/admin/src/app/(admin)/admin/users/components/columns.tsx` | Source File | AdminUser, columns | @tanstack/react-table, ../../actions, lucide-react | - |
| `apps/admin/src/app/(admin)/admin/users/components/data-table.tsx` | Source File | DataTable | react, lucide-react, @/components/ui/button, @/components/ui/input | useState |
| `apps/admin/src/app/(admin)/admin/users/page.tsx` | Source File | - | ./components/columns, @qoe/db/client, ./components/data-table, lucide-react | - |
| `apps/admin/src/app/(admin)/admin/widgets/actions.ts` | Source File | - | next/cache, @qoe/db/client | - |
| `apps/admin/src/app/(admin)/admin/widgets/components/WidgetsCMS.tsx` | Source File | WidgetsCMS | ../actions, react, @qoe/utils, lucide-react, framer-motion | useState |
| `apps/admin/src/app/(admin)/admin/widgets/page.tsx` | Source File | - | ./components/WidgetsCMS, @qoe/db/client | - |
| `apps/admin/src/app/layout.tsx` | Source File | metadata | next/font/google, @/components/ui/sonner, next, @qoe/i18n/provider, @qoe/i18n/server, @/components/ui/tooltip, @qoe/ui, @qoe/utils, @qoe/analytics/client | - |
| `apps/admin/src/app/login/actions.ts` | Source File | - | @qoe/supabase/server, next/navigation | - |
| `apps/admin/src/app/page.tsx` | Source File | RootPage | next/navigation | - |
| `apps/admin/src/components/admin/AdminHeader.tsx` | Source File | - | - | - |
| `apps/admin/src/components/feed/ArticleCard.tsx` | Source File | ArticleCard | next/link | - |
| `apps/admin/src/components/feed/MicroPostCard.tsx` | Source File | MicroPostCard | next/link | - |
| `apps/admin/src/components/feed/PublicFeedPreview.tsx` | Source File | PublicFeedPreview | @/components/ui/Logo, @/components/feed/MicroPostCard, next/link, @qoe/config/features, lucide-react, @qoe/ui/button, @qoe/analytics/events, @/components/feed/ArticleCard | - |
| `apps/admin/src/components/layout/AppSidebar.tsx` | Source File | AppSidebar | @/components/ui/Logo, react, @/app/login/actions, @qoe/utils, framer-motion, next/navigation | useState |
| `apps/admin/src/components/layout/Footer.tsx` | Source File | Footer | react, next/link, @qoe/i18n/server | - |
| `apps/admin/src/components/layout/MainContentWrapper.tsx` | Source File | MainContentWrapper | react, @qoe/utils, next/navigation | - |
| `apps/admin/src/components/layout/Navbar.tsx` | Source File | Navbar | react, @qoe/i18n, framer-motion, next/link | - |
| `apps/admin/src/components/layout/NavbarPremium.tsx` | Source File | NavbarPremium | @qoe/i18n, @/components/ui/Logo, @/components/ui/avatar, react, lucide-react, next/link, @/components/ui/dropdown-menu, @qoe/utils, @/app/login/actions, framer-motion | useState, useEffect |
| `apps/admin/src/components/layout/ReaderPageLayout.tsx` | Source File | ReaderPageLayout | react, @qoe/utils, next/navigation | - |
| `apps/admin/src/components/ui/AccessibilityMenu.tsx` | Source File | AccessibilityMenu | react, lucide-react | useState, useEffect, localStorage |
| `apps/admin/src/components/ui/AnimatedBentoCard.tsx` | Source File | AnimatedBentoCard | react, @/lib/animations/motion-profiles, framer-motion, @qoe/utils | - |
| `apps/admin/src/components/ui/AskQoeBar.tsx` | Source File | AskQoeBar | @qoe/i18n, react, next-themes, cmdk, lucide-react, framer-motion, next/navigation | useState, useEffect |
| `apps/admin/src/components/ui/BentoPlateau.tsx` | Source File | BentoPlateau, BentoItem | react, framer-motion, @qoe/utils | - |
| `apps/admin/src/components/ui/Card.tsx` | Source File | Card | react, @qoe/utils | - |
| `apps/admin/src/components/ui/Logo.tsx` | Source File | Logo | react, @qoe/utils | - |
| `apps/admin/src/components/ui/ReadingProgressBar.tsx` | Source File | ReadingProgressBar | react, framer-motion | useState, useEffect |
| `apps/admin/src/components/ui/Reveal.tsx` | Source File | Reveal | react, framer-motion | useEffect |
| `apps/admin/src/components/ui/TabErrorBoundary.tsx` | Source File | TabErrorBoundary | react, lucide-react | - |
| `apps/admin/src/components/ui/TextParser.tsx` | Source File | TextParser | react, @qoe/utils | - |
| `apps/admin/src/components/ui/ThemeToggle.tsx` | Source File | ThemeToggle | react, next-themes, @/components/ui/button, lucide-react | useState, useEffect |
| `apps/admin/src/components/ui/Typewriter.tsx` | Source File | Typewriter | react | useState, useEffect |
| `apps/admin/src/components/ui/avatar.tsx` | Source File | - | react, @base-ui/react/avatar, @qoe/utils | - |
| `apps/admin/src/components/ui/button.tsx` | Source File | - | @qoe/utils, class-variance-authority, @base-ui/react/button | - |
| `apps/admin/src/components/ui/calendar.tsx` | Source File | - | react, @/components/ui/button, @qoe/utils, lucide-react | useEffect |
| `apps/admin/src/components/ui/dropdown-menu.tsx` | Source File | - | react, @qoe/utils, @base-ui/react/menu, lucide-react | - |
| `apps/admin/src/components/ui/hover-card.tsx` | Source File | - | @base-ui/react/preview-card, @qoe/utils | - |
| `apps/admin/src/components/ui/input.tsx` | Source File | - | react, @qoe/utils, @base-ui/react/input | - |
| `apps/admin/src/components/ui/label.tsx` | Source File | - | react, @qoe/utils | - |
| `apps/admin/src/components/ui/period-select.tsx` | Source File | PeriodSelectorProps, TimePeriodSelect | react, ./time-picker-utils | - |
| `apps/admin/src/components/ui/popover.tsx` | Source File | - | react, @base-ui/react/popover, @qoe/utils | - |
| `apps/admin/src/components/ui/select.tsx` | Source File | - | react, @base-ui/react/select, @qoe/utils, lucide-react | - |
| `apps/admin/src/components/ui/separator.tsx` | Source File | - | @base-ui/react/separator, @qoe/utils | - |
| `apps/admin/src/components/ui/sheet.tsx` | Source File | - | react, @/components/ui/button, lucide-react, @qoe/utils, @base-ui/react/dialog | - |
| `apps/admin/src/components/ui/sidebar.tsx` | Source File | - | ../../hooks/use-mobile, class-variance-authority, @/components/ui/input, react, @/components/ui/separator, @/components/ui/button, @/components/ui/skeleton, @qoe/utils, lucide-react, @base-ui/react/use-render, @base-ui/react/merge-props | useState, useEffect, Context |
| `apps/admin/src/components/ui/skeleton.tsx` | Source File | - | @qoe/utils | - |
| `apps/admin/src/components/ui/sonner.tsx` | Source File | - | next-themes, sonner, lucide-react | - |
| `apps/admin/src/components/ui/table.tsx` | Source File | - | react, @qoe/utils | - |
| `apps/admin/src/components/ui/time-picker-demo.tsx` | Source File | TimePickerDemo | react, @/components/ui/label, ./time-picker-input, lucide-react | - |
| `apps/admin/src/components/ui/time-picker-input.tsx` | Source File | TimePickerInputProps | react, @qoe/utils, @/components/ui/input | useState, useEffect |
| `apps/admin/src/components/ui/time-picker-utils.ts` | Source File | isValidHour, isValid12Hour, isValidMinuteOrSecond, getValidNumber, getValidHour, getValid12Hour, getValidMinuteOrSecond, getValidArrowNumber, getValidArrowHour, getValidArrow12Hour, getValidArrowMinuteOrSecond, setMinutes, setSeconds, setHours, set12Hours, TimePickerType, Period, setDateByType, getDateByType, getArrowByType, convert12HourTo24Hour, display12HourValue | - | - |
| `apps/admin/src/components/ui/time-picker/period-select.tsx` | Source File | PeriodSelectorProps, TimePeriodSelect | react, ./time-picker-utils | - |
| `apps/admin/src/components/ui/time-picker/time-picker-demo.tsx` | Source File | TimePickerDemo | react, @/components/ui/label, ./time-picker-input, lucide-react | - |
| `apps/admin/src/components/ui/time-picker/time-picker-input.tsx` | Source File | TimePickerInputProps | react, @qoe/utils, @/components/ui/input | useState, useEffect |
| `apps/admin/src/components/ui/time-picker/time-picker-utils.ts` | Source File | isValidHour, isValid12Hour, isValidMinuteOrSecond, getValidNumber, getValidHour, getValid12Hour, getValidMinuteOrSecond, getValidArrowNumber, getValidArrowHour, getValidArrow12Hour, getValidArrowMinuteOrSecond, setMinutes, setSeconds, setHours, set12Hours, TimePickerType, Period, setDateByType, getDateByType, getArrowByType, convert12HourTo24Hour, display12HourValue | - | - |
| `apps/admin/src/components/ui/tooltip.tsx` | Source File | - | @base-ui/react/tooltip, @qoe/utils | - |
| `apps/admin/src/features/dashboard/components/app-sidebar.tsx` | Source File | - | @/components/ui/avatar, @qoe/db/client, @qoe/i18n/server, @/components/ui/dropdown-menu, @/app/login/actions, lucide-react, @qoe/supabase/server | - |
| `apps/admin/src/features/editor/components/Editor.tsx` | Source File | EditorProps, Editor | react, @tiptap/react, @tiptap/extension-underline, ../extensions/PaywallDivider, @tiptap/extension-image, use-debounce, @tiptap/starter-kit, @qoe/utils | useState, useEffect |
| `apps/admin/src/features/editor/extensions/PaywallDivider.ts` | Source File | PaywallDividerOptions, PaywallDivider | @tiptap/react, @tiptap/core, ./PaywallDividerComponent | - |
| `apps/admin/src/features/editor/extensions/PaywallDividerComponent.tsx` | Source File | PaywallDividerComponent | @tiptap/react, lucide-react | - |
| `apps/admin/src/features/editor/index.ts` | Source File | - | - | - |
| `apps/admin/src/hooks/use-mobile.ts` | Source File | useIsMobile | react | useState, useEffect |
| `apps/admin/src/lib/ai.ts` | Source File | - | - | - |
| `apps/admin/src/lib/analytics.ts` | Source File | trackServerEvent | - | - |
| `apps/admin/src/lib/animations/motion-profiles.ts` | Source File | springTransition, fadeUpVariant, dropdownVariant, bentoHoverVariant | framer-motion | - |
| `apps/admin/src/lib/cached-queries.ts` | Source File | getRequestDbUser, getCachedSystemConfig, getCachedStandardArticles | react, @qoe/db/client, next/cache | - |
| `apps/admin/src/lib/i18n.ts` | Source File | Locale | - | - |
| `apps/admin/src/lib/safe-action.ts` | Source File | ActionResponse, safeAction | @qoe/supabase/server | - |
| `apps/admin/src/lib/sanitize.ts` | Source File | sanitizeHtml | - | - |
| `apps/admin/src/lib/supabase/client.ts` | Source File | createClient | @supabase/ssr | - |
| `apps/admin/src/lib/supabase/server.ts` | Source File | - | @supabase/ssr, next/headers | Cookies |
| `apps/admin/src/lib/utils.ts` | Source File | cn | tailwind-merge, clsx | - |
| `apps/admin/tsconfig.json` | Source File | - | - | - |
| `apps/api/Dockerfile` | Source File | - | - | - |
| `apps/api/package.json` | Source File | - | - | - |
| `apps/api/src/index.ts` | Source File | - | node:crypto, hono, hono/cors, hono/logger, @qoe/db/client, @qoe/billing, @hono/node-server | - |
| `apps/api/tsconfig.json` | Source File | - | - | - |
| `apps/api/tsup.config.ts` | Source File | - | tsup | - |
| `apps/dashboard/STYLE.md` | Source File | - | - | - |
| `apps/dashboard/middleware.ts` | Source File | config | @qoe/supabase/middleware, next/server | - |
| `apps/dashboard/next.config.ts` | Source File | - | next | - |
| `apps/dashboard/package.json` | Source File | - | - | - |
| `apps/dashboard/src/app/(creator)/analytics/page.tsx` | Source File | AnalyticsPage | - | - |
| `apps/dashboard/src/app/(creator)/articles/[id]/edit-article-client.tsx` | Source File | EditArticleClient | react, ../actions, @/features/editor/components/Editor, next/navigation | useState |
| `apps/dashboard/src/app/(creator)/articles/[id]/page.tsx` | Source File | - | next/navigation, ./edit-article-client, ../actions | - |
| `apps/dashboard/src/app/(creator)/articles/actions.ts` | Source File | - | @qoe/db/client, next/cache, @qoe/auth/current-user, @qoe/utils | - |
| `apps/dashboard/src/app/(creator)/articles/articles-client.tsx` | Source File | ArticlesClient | react, framer-motion, @qoe/utils | useState |
| `apps/dashboard/src/app/(creator)/articles/new/new-article-client.tsx` | Source File | NewArticleClient | react, ../actions, @/features/editor/components/Editor, next/navigation | useState |
| `apps/dashboard/src/app/(creator)/articles/new/page.tsx` | Source File | - | ./new-article-client, ../actions | - |
| `apps/dashboard/src/app/(creator)/articles/page.tsx` | Source File | - | ./articles-client, ./actions | - |
| `apps/dashboard/src/app/(creator)/audience/page.tsx` | Source File | AudiencePage | - | - |
| `apps/dashboard/src/app/(creator)/developer/page.tsx` | Source File | - | @qoe/db/client, @qoe/auth/current-user, @/features/developer/components/developer-client, next/navigation | - |
| `apps/dashboard/src/app/(creator)/layout.tsx` | Source File | - | @/features/dashboard/components/HeaderClient, @/features/dashboard/components/app-sidebar, @qoe/auth/current-user, @/components/ui/sidebar, next/navigation | - |
| `apps/dashboard/src/app/(creator)/newsletters/page.tsx` | Source File | NewslettersPage | - | - |
| `apps/dashboard/src/app/(creator)/page.tsx` | Source File | - | react, @qoe/db/client, @qoe/i18n/server, @qoe/auth/current-user, lucide-react | - |
| `apps/dashboard/src/app/(creator)/settings/page.tsx` | Source File | - | @/features/settings/components/visual-studio, @qoe/db/client, @qoe/supabase/server, next/navigation | - |
| `apps/dashboard/src/app/api/articles/upload/route.ts` | Source File | - | @qoe/config, @qoe/auth/current-user, next/server, @qoe/supabase/server | - |
| `apps/dashboard/src/app/layout.tsx` | Source File | metadata | next/font/google, @/components/ui/sonner, next, @qoe/i18n/provider, @qoe/i18n/server, @/components/ui/tooltip, @qoe/ui, @qoe/utils, @qoe/analytics/client | - |
| `apps/dashboard/src/app/login/actions.ts` | Source File | - | @qoe/supabase/server, next/navigation | - |
| `apps/dashboard/src/app/onboarding/page.tsx` | Source File | - | @/features/onboarding/components/wizard, @qoe/auth/current-user, next/navigation | - |
| `apps/dashboard/src/components/feed/ArticleCard.tsx` | Source File | ArticleCard | next/link | - |
| `apps/dashboard/src/components/feed/MicroPostCard.tsx` | Source File | MicroPostCard | next/link | - |
| `apps/dashboard/src/components/feed/PublicFeedPreview.tsx` | Source File | PublicFeedPreview | @/components/ui/Logo, @/components/feed/MicroPostCard, next/link, @qoe/config/features, lucide-react, @qoe/ui/button, @qoe/analytics/events, @/components/feed/ArticleCard | - |
| `apps/dashboard/src/components/layout/AppSidebar.tsx` | Source File | AppSidebar | @/components/ui/Logo, react, @/app/login/actions, @qoe/utils, framer-motion, next/navigation | useState |
| `apps/dashboard/src/components/layout/DashboardComponents.tsx` | Source File | PageHeader, EmptyState | react, @qoe/utils, lucide-react | - |
| `apps/dashboard/src/components/layout/Footer.tsx` | Source File | Footer | react, next/link, @qoe/i18n/server | - |
| `apps/dashboard/src/components/layout/MainContentWrapper.tsx` | Source File | MainContentWrapper | react, @qoe/utils, next/navigation | - |
| `apps/dashboard/src/components/layout/Navbar.tsx` | Source File | Navbar | react, @qoe/i18n, framer-motion, next/link | - |
| `apps/dashboard/src/components/layout/NavbarPremium.tsx` | Source File | NavbarPremium | @qoe/i18n, @/components/ui/Logo, @/components/ui/avatar, react, lucide-react, next/link, @/components/ui/dropdown-menu, @qoe/utils, @/app/login/actions, framer-motion | useState, useEffect |
| `apps/dashboard/src/components/layout/ReaderPageLayout.tsx` | Source File | ReaderPageLayout | react, @qoe/utils, next/navigation | - |
| `apps/dashboard/src/components/ui/AccessibilityMenu.tsx` | Source File | AccessibilityMenu | react, lucide-react | useState, useEffect, localStorage |
| `apps/dashboard/src/components/ui/AnimatedBentoCard.tsx` | Source File | AnimatedBentoCard | react, @/lib/animations/motion-profiles, framer-motion, @qoe/utils | - |
| `apps/dashboard/src/components/ui/AskQoeBar.tsx` | Source File | AskQoeBar | @qoe/i18n, react, next-themes, cmdk, lucide-react, framer-motion, next/navigation | useState, useEffect |
| `apps/dashboard/src/components/ui/BentoPlateau.tsx` | Source File | BentoPlateau, BentoItem | react, framer-motion, @qoe/utils | - |
| `apps/dashboard/src/components/ui/Card.tsx` | Source File | Card | react, @qoe/utils | - |
| `apps/dashboard/src/components/ui/Logo.tsx` | Source File | Logo | react, @qoe/utils | - |
| `apps/dashboard/src/components/ui/ReadingProgressBar.tsx` | Source File | ReadingProgressBar | react, framer-motion | useState, useEffect |
| `apps/dashboard/src/components/ui/Reveal.tsx` | Source File | Reveal | react, framer-motion | useEffect |
| `apps/dashboard/src/components/ui/TabErrorBoundary.tsx` | Source File | TabErrorBoundary | react, lucide-react | - |
| `apps/dashboard/src/components/ui/TextParser.tsx` | Source File | TextParser | react, @qoe/utils | - |
| `apps/dashboard/src/components/ui/ThemeToggle.tsx` | Source File | ThemeToggle | react, next-themes, @/components/ui/button, lucide-react | useState, useEffect |
| `apps/dashboard/src/components/ui/Typewriter.tsx` | Source File | Typewriter | react | useState, useEffect |
| `apps/dashboard/src/components/ui/avatar.tsx` | Source File | - | react, @base-ui/react/avatar, @qoe/utils | - |
| `apps/dashboard/src/components/ui/button.tsx` | Source File | - | @qoe/utils, class-variance-authority, @base-ui/react/button | - |
| `apps/dashboard/src/components/ui/calendar.tsx` | Source File | - | react, @/components/ui/button, @qoe/utils, lucide-react | useEffect |
| `apps/dashboard/src/components/ui/dropdown-menu.tsx` | Source File | - | react, @qoe/utils, @base-ui/react/menu, lucide-react | - |
| `apps/dashboard/src/components/ui/hover-card.tsx` | Source File | - | @base-ui/react/preview-card, @qoe/utils | - |
| `apps/dashboard/src/components/ui/input.tsx` | Source File | - | react, @qoe/utils, @base-ui/react/input | - |
| `apps/dashboard/src/components/ui/label.tsx` | Source File | - | react, @qoe/utils | - |
| `apps/dashboard/src/components/ui/period-select.tsx` | Source File | PeriodSelectorProps, TimePeriodSelect | react, ./time-picker-utils | - |
| `apps/dashboard/src/components/ui/popover.tsx` | Source File | - | react, @base-ui/react/popover, @qoe/utils | - |
| `apps/dashboard/src/components/ui/select.tsx` | Source File | - | react, @base-ui/react/select, @qoe/utils, lucide-react | - |
| `apps/dashboard/src/components/ui/separator.tsx` | Source File | - | @base-ui/react/separator, @qoe/utils | - |
| `apps/dashboard/src/components/ui/sheet.tsx` | Source File | - | react, @/components/ui/button, lucide-react, @qoe/utils, @base-ui/react/dialog | - |
| `apps/dashboard/src/components/ui/sidebar.tsx` | Source File | - | ../../hooks/use-mobile, class-variance-authority, @/components/ui/input, react, @/components/ui/separator, @/components/ui/button, @/components/ui/skeleton, @qoe/utils, lucide-react, @base-ui/react/use-render, @base-ui/react/merge-props | useState, useEffect, Context |
| `apps/dashboard/src/components/ui/skeleton.tsx` | Source File | - | @qoe/utils | - |
| `apps/dashboard/src/components/ui/sonner.tsx` | Source File | - | next-themes, sonner, lucide-react | - |
| `apps/dashboard/src/components/ui/table.tsx` | Source File | - | react, @qoe/utils | - |
| `apps/dashboard/src/components/ui/time-picker-demo.tsx` | Source File | TimePickerDemo | react, @/components/ui/label, ./time-picker-input, lucide-react | - |
| `apps/dashboard/src/components/ui/time-picker-input.tsx` | Source File | TimePickerInputProps | react, @qoe/utils, @/components/ui/input | useState, useEffect |
| `apps/dashboard/src/components/ui/time-picker-utils.ts` | Source File | isValidHour, isValid12Hour, isValidMinuteOrSecond, getValidNumber, getValidHour, getValid12Hour, getValidMinuteOrSecond, getValidArrowNumber, getValidArrowHour, getValidArrow12Hour, getValidArrowMinuteOrSecond, setMinutes, setSeconds, setHours, set12Hours, TimePickerType, Period, setDateByType, getDateByType, getArrowByType, convert12HourTo24Hour, display12HourValue | - | - |
| `apps/dashboard/src/components/ui/time-picker/period-select.tsx` | Source File | PeriodSelectorProps, TimePeriodSelect | react, ./time-picker-utils | - |
| `apps/dashboard/src/components/ui/time-picker/time-picker-demo.tsx` | Source File | TimePickerDemo | react, @/components/ui/label, ./time-picker-input, lucide-react | - |
| `apps/dashboard/src/components/ui/time-picker/time-picker-input.tsx` | Source File | TimePickerInputProps | react, @qoe/utils, @/components/ui/input | useState, useEffect |
| `apps/dashboard/src/components/ui/time-picker/time-picker-utils.ts` | Source File | isValidHour, isValid12Hour, isValidMinuteOrSecond, getValidNumber, getValidHour, getValid12Hour, getValidMinuteOrSecond, getValidArrowNumber, getValidArrowHour, getValidArrow12Hour, getValidArrowMinuteOrSecond, setMinutes, setSeconds, setHours, set12Hours, TimePickerType, Period, setDateByType, getDateByType, getArrowByType, convert12HourTo24Hour, display12HourValue | - | - |
| `apps/dashboard/src/components/ui/tooltip.tsx` | Source File | - | @base-ui/react/tooltip, @qoe/utils | - |
| `apps/dashboard/src/features/dashboard/components/HeaderClient.tsx` | Source File | HeaderClient | react, sonner, @qoe/utils, lucide-react, @/components/ui/sidebar, next/navigation | useState, useEffect |
| `apps/dashboard/src/features/dashboard/components/SidebarMenuClient.tsx` | Source File | IconName, SidebarMenuClient | react, lucide-react, @qoe/utils, next/navigation | - |
| `apps/dashboard/src/features/dashboard/components/app-sidebar.tsx` | Source File | - | @/components/ui/avatar, @qoe/db/client, @qoe/i18n/server, @qoe/ui, @/components/ui/dropdown-menu, @/app/login/actions, @qoe/supabase/server, ./SidebarMenuClient | - |
| `apps/dashboard/src/features/developer/actions.ts` | Source File | - | @qoe/db/client, next/cache, node:crypto, @qoe/auth/current-user | - |
| `apps/dashboard/src/features/developer/components/developer-client.tsx` | Source File | DeveloperClient | react, framer-motion, sonner | useState |
| `apps/dashboard/src/features/editor/components/Editor.tsx` | Source File | EditorProps, Editor | react, @tiptap/react, @tiptap/extension-underline, ../extensions/PaywallDivider, @tiptap/extension-image, @tiptap/starter-kit, @qoe/utils | useState, useEffect |
| `apps/dashboard/src/features/editor/extensions/PaywallDivider.ts` | Source File | PaywallDividerOptions, PaywallDivider | @tiptap/react, @tiptap/core, ./PaywallDividerComponent | - |
| `apps/dashboard/src/features/editor/extensions/PaywallDividerComponent.tsx` | Source File | PaywallDividerComponent | @tiptap/react, lucide-react | - |
| `apps/dashboard/src/features/editor/index.ts` | Source File | - | - | - |
| `apps/dashboard/src/features/onboarding/actions.ts` | Source File | - | next/cache, @qoe/db/client, @qoe/auth/current-user | - |
| `apps/dashboard/src/features/onboarding/components/wizard.tsx` | Source File | OnboardingWizard | ../actions, react, @/components/ui/BentoPlateau, framer-motion, next/navigation | useState, useEffect |
| `apps/dashboard/src/features/settings/actions.ts` | Source File | - | @qoe/db/client, next/cache, @qoe/auth/current-user | - |
| `apps/dashboard/src/features/settings/components/creator-studio-legacy.tsx` | Source File | ClientNavigationItem, ClientSocialLink, StudioArticle, ClientCategory, CreatorProfile, ThemePreset, SITE_THEMES, SITE_FONTS, CreatorStudio | react, use-debounce, next-themes, sonner, framer-motion | useState, useEffect |
| `apps/dashboard/src/features/settings/components/settings-client.tsx` | Source File | NavigationItem, SocialLink, CreatorProfile, ThemePreset, SITE_THEMES, SettingsClient | react, framer-motion, sonner, use-debounce | useState, useEffect |
| `apps/dashboard/src/features/settings/components/visual-studio.tsx` | Source File | ClientNavigationItem, ClientSocialLink, StudioArticle, ClientCategory, CreatorProfile, ACCENT_SWATCHES, SITE_FONTS, VisualStudio | react, use-debounce, next-themes, sonner, framer-motion | useState, useEffect |
| `apps/dashboard/src/hooks/use-mobile.ts` | Source File | useIsMobile | react | useState, useEffect |
| `apps/dashboard/src/lib/ai.ts` | Source File | - | - | - |
| `apps/dashboard/src/lib/analytics.ts` | Source File | trackServerEvent | - | - |
| `apps/dashboard/src/lib/animations/motion-profiles.ts` | Source File | springTransition, fadeUpVariant, dropdownVariant, bentoHoverVariant | framer-motion | - |
| `apps/dashboard/src/lib/cached-queries.ts` | Source File | getRequestDbUser, getCachedSystemConfig, getCachedStandardArticles | react, @qoe/db/client, next/cache | - |
| `apps/dashboard/src/lib/i18n.ts` | Source File | Locale | - | - |
| `apps/dashboard/src/lib/safe-action.ts` | Source File | ActionResponse, safeAction | @qoe/supabase/server | - |
| `apps/dashboard/src/lib/sanitize.ts` | Source File | sanitizeHtml | - | - |
| `apps/dashboard/src/lib/supabase/client.ts` | Source File | createClient | @supabase/ssr | - |
| `apps/dashboard/src/lib/supabase/server.ts` | Source File | - | @supabase/ssr, next/headers | Cookies |
| `apps/dashboard/src/lib/utils.ts` | Source File | cn | tailwind-merge, clsx | - |
| `apps/dashboard/tsconfig.json` | Source File | - | - | - |
| `apps/feed/middleware.ts` | Source File | config | @qoe/supabase/middleware, next/server | - |
| `apps/feed/next.config.ts` | Source File | - | next | - |
| `apps/feed/package.json` | Source File | - | - | - |
| `apps/feed/src/app/(reader)/billing/page.tsx` | Feed UI | - | @/components/layout/ReaderPageLayout, @qoe/db/client, lucide-react, @qoe/supabase/server, next/navigation | - |
| `apps/feed/src/app/(reader)/highlights/page.tsx` | Feed UI | - | @/components/layout/ReaderPageLayout, @qoe/db/client, @qoe/i18n/server, lucide-react, @qoe/supabase/server, next/navigation | - |
| `apps/feed/src/app/(reader)/home/FeedDashboard.tsx` | Source File | FeedDashboard | @qoe/i18n, @/lib/analytics, @/components/layout/ReaderPageLayout, ./components/MicroPostComposer, ./actions, react, ./components/ExpandedPostView, ./components/LoginModal, next/link, ./components/HomeWidgets, @qoe/utils, ./components/FeedTabsHeader, ./components/ArticleCard, framer-motion | useState |
| `apps/feed/src/app/(reader)/home/actions.ts` | Source File | toggleFollowCreatorHome, toggleBookmarkArticleHome, createMicroPost, toggleLikePost, replyToPost, getPostThread, getArticleThread, repostPost, deletePost, getProfileData, getUserDrafts, pinPost, unpinPost, unfurlUrl | next/cache, @qoe/db/client, @qoe/supabase/server, @/lib/safe-action | - |
| `apps/feed/src/app/(reader)/home/components/ArticleCard.tsx` | Source File | ArticleCard, MagneticButton | @qoe/i18n, @/components/ui/hover-card, react, react-wrap-balancer, @qoe/utils, lucide-react, framer-motion, @/components/social/MicroPostCard | useState |
| `apps/feed/src/app/(reader)/home/components/ExpandedPostView.tsx` | Source File | ExpandedPostView | @/components/ui/TextParser, @qoe/i18n, @/components/icons/CustomIcons, @/lib/analytics, ../actions, react, @/components/social/LinkPreview, @qoe/utils, lucide-react, framer-motion | useState, useEffect |
| `apps/feed/src/app/(reader)/home/components/FeedSidebarWidgets.tsx` | Source File | FeedSidebarWidgets | @qoe/i18n, react, @qoe/utils, lucide-react, framer-motion | useState |
| `apps/feed/src/app/(reader)/home/components/FeedTabsHeader.tsx` | Source File | FeedTabsHeader | react, @qoe/i18n, framer-motion, @qoe/utils | - |
| `apps/feed/src/app/(reader)/home/components/HomeWidgets.tsx` | Source File | HomeWidgets | react, framer-motion, @qoe/utils, lucide-react | useEffect |
| `apps/feed/src/app/(reader)/home/components/LoginModal.tsx` | Source File | LoginModal | @qoe/supabase/client, react, @qoe/utils, lucide-react, framer-motion | useState |
| `apps/feed/src/app/(reader)/home/components/MicroPostComposer.tsx` | Source File | MicroPostComposer | @/components/ui/popover, @/components/ui/time-picker/time-picker-input, react, @/components/ui/sheet, sonner, @/components/ui/calendar, @qoe/utils, lucide-react, framer-motion, react-image-crop | useState, useEffect, localStorage |
| `apps/feed/src/app/(reader)/home/page.tsx` | Feed UI | - | ./FeedDashboard, @/lib/cached-queries, @qoe/db/client, @qoe/supabase/server, next/navigation | - |
| `apps/feed/src/app/(reader)/layout.tsx` | Source File | - | @/components/layout/MainContentWrapper, ../../lib/cached-queries, @/components/ui/sonner, @qoe/supabase/server, @/components/layout/AppSidebar, next/navigation | - |
| `apps/feed/src/app/(reader)/library/LibraryClient.tsx` | Source File | LibraryClient | @qoe/i18n, @qoe/analytics, @/components/layout/ReaderPageLayout, react, lucide-react, framer-motion | - |
| `apps/feed/src/app/(reader)/library/page.tsx` | Feed UI | - | ./LibraryClient, @qoe/db/client, @qoe/supabase/server, next/navigation | - |
| `apps/feed/src/app/(reader)/onboarding/OnboardingFlow.tsx` | Source File | OnboardingFlow | @qoe/i18n, @/components/ui/Logo, @/components/ui/input, react, ./actions, @/components/ui/button, @/components/ui/BentoPlateau, @qoe/utils, lucide-react, framer-motion, next/navigation | useState |
| `apps/feed/src/app/(reader)/onboarding/actions.ts` | Source File | - | ../../../lib/ai, @qoe/db/client, @qoe/supabase/server | - |
| `apps/feed/src/app/(reader)/onboarding/page.tsx` | Feed UI | - | @qoe/db/client, @qoe/supabase/server, ./OnboardingFlow, next/navigation | - |
| `apps/feed/src/app/(reader)/settings/SettingsDashboard.tsx` | Source File | SettingsDashboard | @qoe/i18n, @qoe/analytics, react, @qoe/config, @qoe/utils, framer-motion, next/navigation | useState, localStorage |
| `apps/feed/src/app/(reader)/settings/actions.ts` | Source File | - | next/cache, @qoe/db/client, @qoe/supabase/server | - |
| `apps/feed/src/app/(reader)/settings/page.tsx` | Feed UI | - | @qoe/db/client, @qoe/supabase/server, ./SettingsDashboard, next/navigation | - |
| `apps/feed/src/app/api/upload/route.ts` | Source File | - | next/server, @qoe/supabase/server | - |
| `apps/feed/src/app/auth/callback/route.ts` | Source File | - | next/server, @qoe/supabase/server | - |
| `apps/feed/src/app/auth/sso/sync/route.ts` | Source File | - | next/server, @qoe/supabase, @qoe/supabase/server | - |
| `apps/feed/src/app/layout.tsx` | Source File | metadata | next/font/google, @/components/ui/sonner, next, @qoe/i18n/provider, @qoe/i18n/server, @/components/ui/tooltip, @qoe/ui, @qoe/utils, @qoe/analytics/client | - |
| `apps/feed/src/app/login/actions.ts` | Auth / Login UI | - | @qoe/supabase/server, next/navigation | - |
| `apps/feed/src/app/login/login-form.tsx` | Auth / Login UI | LoginForm | @qoe/i18n, @/components/ui/Logo, @qoe/supabase/client, ./actions, react, @/components/ui/input, @/components/ui/button, @/components/ui/BentoPlateau, @qoe/utils, framer-motion, next/navigation | useState, useEffect |
| `apps/feed/src/app/login/page.tsx` | Feed UI | - | react, @qoe/i18n/server, ./login-form | - |
| `apps/feed/src/app/page.tsx` | Feed UI | dynamic | next/navigation | - |
| `apps/feed/src/components/feed/ArticleCard.tsx` | Source File | ArticleCard | next/link | - |
| `apps/feed/src/components/feed/MicroPostCard.tsx` | Source File | MicroPostCard | next/link | - |
| `apps/feed/src/components/feed/PublicFeedPreview.tsx` | Source File | PublicFeedPreview | @/components/ui/Logo, @/components/feed/MicroPostCard, @qoe/config, next/link, @qoe/config/features, lucide-react, @qoe/ui/button, @qoe/analytics/events, @/components/feed/ArticleCard | - |
| `apps/feed/src/components/icons/CustomIcons.tsx` | Source File | TimelineIcon, BookmarksIcon, HighlightsIcon, WalletIcon, SettingsIcon, ProfileIcon, LikeIcon, CommentIcon, RepostIcon, ShareIcon, LayoutDashboardIcon, ShieldAlertIcon | react | - |
| `apps/feed/src/components/layout/AppSidebar.tsx` | Source File | AppSidebar | @/components/ui/Logo, react, @qoe/config, @/app/login/actions, @qoe/utils, framer-motion, next/navigation | useState, useEffect |
| `apps/feed/src/components/layout/Footer.tsx` | Source File | Footer | react, next/link, @qoe/i18n/server | - |
| `apps/feed/src/components/layout/MainContentWrapper.tsx` | Source File | MainContentWrapper | react, @qoe/utils, next/navigation | - |
| `apps/feed/src/components/layout/Navbar.tsx` | Source File | Navbar | react, @qoe/i18n, framer-motion, next/link | - |
| `apps/feed/src/components/layout/NavbarPremium.tsx` | Source File | NavbarPremium | @qoe/i18n, @/components/ui/Logo, @/components/ui/avatar, react, lucide-react, next/link, @/components/ui/dropdown-menu, @qoe/utils, @/app/login/actions, framer-motion | useState, useEffect |
| `apps/feed/src/components/layout/ReaderPageLayout.tsx` | Source File | ReaderPageLayout | react, @qoe/utils, next/navigation | - |
| `apps/feed/src/components/social/LinkPreview.tsx` | Source File | LinkPreview | react, framer-motion, @qoe/utils, lucide-react | useState, useEffect |
| `apps/feed/src/components/social/MicroPostCard.tsx` | Source File | MicroPostData, MicroPostCard | @/components/ui/TextParser, @/components/ui/popover, @/components/ui/hover-card, @/lib/supabase/client, react, sonner, @qoe/utils, lucide-react, ./LinkPreview, framer-motion | useState, useEffect |
| `apps/feed/src/components/ui/AccessibilityMenu.tsx` | Source File | AccessibilityMenu | react, lucide-react | useState, useEffect, localStorage |
| `apps/feed/src/components/ui/AnimatedBentoCard.tsx` | Source File | AnimatedBentoCard | react, @/lib/animations/motion-profiles, framer-motion, @qoe/utils | - |
| `apps/feed/src/components/ui/AskQoeBar.tsx` | Source File | AskQoeBar | @qoe/i18n, react, next-themes, cmdk, lucide-react, framer-motion, next/navigation | useState, useEffect |
| `apps/feed/src/components/ui/BentoPlateau.tsx` | Source File | BentoPlateau, BentoItem | react, framer-motion, @qoe/utils | - |
| `apps/feed/src/components/ui/Card.tsx` | Source File | Card | react, @qoe/utils | - |
| `apps/feed/src/components/ui/Logo.tsx` | Source File | Logo | react, @qoe/utils | - |
| `apps/feed/src/components/ui/ReadingProgressBar.tsx` | Source File | ReadingProgressBar | react, framer-motion | useState, useEffect |
| `apps/feed/src/components/ui/Reveal.tsx` | Source File | Reveal | react, framer-motion | useEffect |
| `apps/feed/src/components/ui/TabErrorBoundary.tsx` | Source File | TabErrorBoundary | react, lucide-react | - |
| `apps/feed/src/components/ui/TextParser.tsx` | Source File | TextParser | react, @qoe/utils | - |
| `apps/feed/src/components/ui/ThemeToggle.tsx` | Source File | ThemeToggle | react, next-themes, @/components/ui/button, lucide-react | useState, useEffect |
| `apps/feed/src/components/ui/Typewriter.tsx` | Source File | Typewriter | react | useState, useEffect |
| `apps/feed/src/components/ui/avatar.tsx` | Source File | - | react, @base-ui/react/avatar, @qoe/utils | - |
| `apps/feed/src/components/ui/button.tsx` | Source File | - | @qoe/utils, class-variance-authority, @base-ui/react/button | - |
| `apps/feed/src/components/ui/calendar.tsx` | Source File | - | react, @/components/ui/button, @qoe/utils, lucide-react | useEffect |
| `apps/feed/src/components/ui/dropdown-menu.tsx` | Source File | - | react, @qoe/utils, @base-ui/react/menu, lucide-react | - |
| `apps/feed/src/components/ui/hover-card.tsx` | Source File | - | @base-ui/react/preview-card, @qoe/utils | - |
| `apps/feed/src/components/ui/input.tsx` | Source File | - | react, @qoe/utils, @base-ui/react/input | - |
| `apps/feed/src/components/ui/label.tsx` | Source File | - | react, @qoe/utils | - |
| `apps/feed/src/components/ui/period-select.tsx` | Source File | PeriodSelectorProps, TimePeriodSelect | react, ./time-picker-utils | - |
| `apps/feed/src/components/ui/popover.tsx` | Source File | - | react, @base-ui/react/popover, @qoe/utils | - |
| `apps/feed/src/components/ui/select.tsx` | Source File | - | react, @base-ui/react/select, @qoe/utils, lucide-react | - |
| `apps/feed/src/components/ui/separator.tsx` | Source File | - | @base-ui/react/separator, @qoe/utils | - |
| `apps/feed/src/components/ui/sheet.tsx` | Source File | - | react, @/components/ui/button, lucide-react, @qoe/utils, @base-ui/react/dialog | - |
| `apps/feed/src/components/ui/sidebar.tsx` | Source File | - | ../../hooks/use-mobile, class-variance-authority, @/components/ui/input, react, @/components/ui/separator, @/components/ui/button, @/components/ui/skeleton, @qoe/utils, lucide-react, @base-ui/react/use-render, @base-ui/react/merge-props | useState, useEffect, Context |
| `apps/feed/src/components/ui/skeleton.tsx` | Source File | - | @qoe/utils | - |
| `apps/feed/src/components/ui/sonner.tsx` | Source File | - | next-themes, sonner, lucide-react | - |
| `apps/feed/src/components/ui/table.tsx` | Source File | - | react, @qoe/utils | - |
| `apps/feed/src/components/ui/time-picker-demo.tsx` | Source File | TimePickerDemo | react, @/components/ui/label, ./time-picker-input, lucide-react | - |
| `apps/feed/src/components/ui/time-picker-input.tsx` | Source File | TimePickerInputProps | react, @qoe/utils, @/components/ui/input | useState, useEffect |
| `apps/feed/src/components/ui/time-picker-utils.ts` | Source File | isValidHour, isValid12Hour, isValidMinuteOrSecond, getValidNumber, getValidHour, getValid12Hour, getValidMinuteOrSecond, getValidArrowNumber, getValidArrowHour, getValidArrow12Hour, getValidArrowMinuteOrSecond, setMinutes, setSeconds, setHours, set12Hours, TimePickerType, Period, setDateByType, getDateByType, getArrowByType, convert12HourTo24Hour, display12HourValue | - | - |
| `apps/feed/src/components/ui/time-picker/period-select.tsx` | Source File | PeriodSelectorProps, TimePeriodSelect | react, ./time-picker-utils | - |
| `apps/feed/src/components/ui/time-picker/time-picker-demo.tsx` | Source File | TimePickerDemo | react, @/components/ui/label, ./time-picker-input, lucide-react | - |
| `apps/feed/src/components/ui/time-picker/time-picker-input.tsx` | Source File | TimePickerInputProps | react, @qoe/utils, @/components/ui/input | useState, useEffect |
| `apps/feed/src/components/ui/time-picker/time-picker-utils.ts` | Source File | isValidHour, isValid12Hour, isValidMinuteOrSecond, getValidNumber, getValidHour, getValid12Hour, getValidMinuteOrSecond, getValidArrowNumber, getValidArrowHour, getValidArrow12Hour, getValidArrowMinuteOrSecond, setMinutes, setSeconds, setHours, set12Hours, TimePickerType, Period, setDateByType, getDateByType, getArrowByType, convert12HourTo24Hour, display12HourValue | - | - |
| `apps/feed/src/components/ui/tooltip.tsx` | Source File | - | @base-ui/react/tooltip, @qoe/utils | - |
| `apps/feed/src/features/dashboard/components/app-sidebar.tsx` | Source File | - | @/components/ui/avatar, @qoe/db/client, @qoe/i18n/server, @/components/ui/dropdown-menu, @/app/login/actions, lucide-react, @qoe/supabase/server | - |
| `apps/feed/src/features/editor/components/Editor.tsx` | Source File | EditorProps, Editor | react, @tiptap/react, @tiptap/extension-underline, ../extensions/PaywallDivider, @tiptap/extension-image, use-debounce, @tiptap/starter-kit, @qoe/utils | useState, useEffect |
| `apps/feed/src/features/editor/extensions/PaywallDivider.ts` | Source File | PaywallDividerOptions, PaywallDivider | @tiptap/react, @tiptap/core, ./PaywallDividerComponent | - |
| `apps/feed/src/features/editor/extensions/PaywallDividerComponent.tsx` | Source File | PaywallDividerComponent | @tiptap/react, lucide-react | - |
| `apps/feed/src/features/editor/index.ts` | Source File | - | - | - |
| `apps/feed/src/hooks/use-mobile.ts` | Source File | useIsMobile | react | useState, useEffect |
| `apps/feed/src/lib/ai.ts` | Source File | - | - | - |
| `apps/feed/src/lib/analytics.ts` | Source File | trackServerEvent, trackEvent | - | - |
| `apps/feed/src/lib/animations/motion-profiles.ts` | Source File | springTransition, fadeUpVariant, dropdownVariant, bentoHoverVariant | framer-motion | - |
| `apps/feed/src/lib/cached-queries.ts` | Source File | getRequestDbUser, getCachedSystemConfig, getCachedStandardArticles | react, @qoe/db/client, next/cache | - |
| `apps/feed/src/lib/i18n.ts` | Source File | Locale | - | - |
| `apps/feed/src/lib/safe-action.ts` | Source File | ActionResponse, safeAction | @qoe/supabase/server | - |
| `apps/feed/src/lib/sanitize.ts` | Source File | sanitizeHtml | - | - |
| `apps/feed/src/lib/supabase/client.ts` | Source File | createClient | @supabase/ssr | - |
| `apps/feed/src/lib/supabase/server.ts` | Source File | - | @supabase/ssr, next/headers | Cookies |
| `apps/feed/src/lib/utils.ts` | Source File | cn | tailwind-merge, clsx | - |
| `apps/feed/tsconfig.json` | Source File | - | - | - |
| `apps/landing/next.config.ts` | Source File | - | next | - |
| `apps/landing/package.json` | Source File | - | - | - |
| `apps/landing/src/app/layout.tsx` | Landing Layout | metadata | next/font/google, next, @qoe/i18n/provider, @qoe/i18n/server, @qoe/ui, @qoe/utils | - |
| `apps/landing/src/app/page.tsx` | Landing Page UI | dynamic | next/cache, @/components/landing/FormatPreview, @/components/landing/CTA, @/components/landing/CreatorHub, @/components/landing/TrustedCreators, @qoe/db/client, @/components/landing/FeaturedPublications, @/components/landing/BentoFeatures, @/config/landing, @/components/layout/NavbarPremium, @/components/landing/Hero, @/components/landing/Marquee, @/components/layout/Footer, @/components/landing/ProductPreview, @/components/landing/ComparisonTable | - |
| `apps/landing/src/components/landing/ArticlePreviewModal.tsx` | Source File | ArticlePreviewModal | @qoe/i18n, react, lucide-react, framer-motion, @/lib/sanitize | useEffect |
| `apps/landing/src/components/landing/BentoFeatures.tsx` | Source File | BentoFeatures | react, @qoe/i18n, framer-motion, lucide-react | - |
| `apps/landing/src/components/landing/CTA.tsx` | Source File | CTA | @qoe/i18n, react, next/link, lucide-react, framer-motion | - |
| `apps/landing/src/components/landing/ComparisonTable.tsx` | Source File | ComparisonTable | react, @qoe/i18n, framer-motion, lucide-react | - |
| `apps/landing/src/components/landing/CreatorHub.tsx` | Source File | CreatorHub | @qoe/i18n, react, next/link, lucide-react, framer-motion | useState |
| `apps/landing/src/components/landing/FeaturedPublications.tsx` | Source File | FeaturedPublications | @qoe/i18n, react, ./ArticlePreviewModal, lucide-react, framer-motion | useState, useEffect |
| `apps/landing/src/components/landing/FormatPreview.tsx` | Source File | FormatPreview | react, @qoe/i18n, framer-motion, lucide-react | useState |
| `apps/landing/src/components/landing/Hero.tsx` | Source File | Hero | @qoe/i18n, react, next/link, @qoe/utils, lucide-react, framer-motion, next/navigation | useState, useEffect |
| `apps/landing/src/components/landing/Marquee.tsx` | Source File | Marquee | react, @/config/landing | - |
| `apps/landing/src/components/landing/ProductPreview.tsx` | Source File | ProductPreview | react, @qoe/i18n, framer-motion, lucide-react | useState |
| `apps/landing/src/components/landing/TrustedCreators.tsx` | Source File | TrustedCreators | react, @qoe/i18n, framer-motion, lucide-react | - |
| `apps/landing/src/components/landing/index.ts` | Source File | - | - | - |
| `apps/landing/src/components/layout/Footer.tsx` | Source File | Footer | react, @qoe/config, next/link, @qoe/i18n/server | - |
| `apps/landing/src/components/layout/NavbarPremium.tsx` | Source File | NavbarPremium | @qoe/i18n, react, @qoe/config, next/link, @qoe/ui, @qoe/utils, framer-motion | useState, useEffect |
| `apps/landing/src/config/landing.ts` | Source File | landingConfig | - | - |
| `apps/landing/src/lib/sanitize.ts` | Source File | sanitizeHtml | - | - |
| `apps/landing/tsconfig.json` | Source File | - | - | - |
| `apps/web/next.config.ts` | Source File | - | next | - |
| `apps/web/package.json` | Source File | - | - | - |
| `apps/web/src/app/api/articles/upload/route.ts` | Source File | - | @qoe/config, @qoe/auth/current-user, next/server, @qoe/supabase/server | - |
| `apps/web/src/app/auth/sso/callback/route.ts` | Source File | - | next/server, @qoe/supabase, @qoe/supabase/server | - |
| `apps/web/src/app/layout.tsx` | Source File | metadata | next/font/google, next, @qoe/i18n/provider, @qoe/i18n/server, @qoe/ui, @qoe/utils | - |
| `apps/web/src/app/page.tsx` | Source File | Home | - | - |
| `apps/web/src/app/robots.ts` | Source File | robots | @qoe/config, next | - |
| `apps/web/src/app/sitemap.ts` | Source File | - | @qoe/config, next | - |
| `apps/web/src/app/tenant/[domain]/actions/subscribe.ts` | Source File | - | @qoe/db/client | - |
| `apps/web/src/app/tenant/[domain]/article/[slug]/PaywallCut.tsx` | Source File | PaywallCut | ./actions, react, next/link, @qoe/utils, lucide-react | useState, useEffect |
| `apps/web/src/app/tenant/[domain]/article/[slug]/ReaderActions.tsx` | Source File | ReaderActions | ./actions, react, @qoe/utils, lucide-react, framer-motion | useState |
| `apps/web/src/app/tenant/[domain]/article/[slug]/TextHighlighter.tsx` | Source File | TextHighlighter | ./actions, react, @qoe/utils, lucide-react, framer-motion | useState, useEffect |
| `apps/web/src/app/tenant/[domain]/article/[slug]/actions.ts` | Source File | - | next/cache, @qoe/db/client, @qoe/supabase/server | - |
| `apps/web/src/app/tenant/[domain]/article/[slug]/page.tsx` | Source File | - | next, ./PaywallCut, ./ReaderActions, @qoe/db/client, next/link, ./TextHighlighter, @qoe/ui, next/headers, lucide-react, @qoe/supabase/server, next/navigation | - |
| `apps/web/src/app/tenant/[domain]/page.tsx` | Source File | - | next, @qoe/db/client, next/link, @qoe/ui, next/navigation | - |
| `apps/web/src/lib/sanitize.ts` | Source File | sanitizeHtml | - | - |
| `apps/web/src/middleware.ts` | Source File | config | @qoe/supabase/middleware, next/server | - |
| `apps/web/tsconfig.json` | Source File | - | - | - |
| `components.json` | Source File | - | - | - |
| `docker-compose.dev.yml` | Source File | - | - | - |
| `docker-compose.yml` | Source File | - | - | - |
| `docker/caddy/Caddyfile` | Source File | - | - | - |
| `eslint.config.mjs` | Source File | - | - | - |
| `messages/en.json` | Source File | - | - | - |
| `messages/fr.json` | Source File | - | - | - |
| `next.config.ts` | Source File | - | next | - |
| `package.json` | Source File | - | - | - |
| `packages/analytics/package.json` | Source File | - | - | - |
| `packages/analytics/src/client.tsx` | Source File | AnalyticsScript, useTrackEvent | react, next/script | useEffect |
| `packages/analytics/src/events.ts` | Source File | EVENTS, EventName, BaseEventProps, EventProps | - | - |
| `packages/analytics/src/index.ts` | Source File | - | - | - |
| `packages/analytics/src/server.ts` | Source File | - | - | - |
| `packages/analytics/tsconfig.json` | Source File | - | - | - |
| `packages/auth/package.json` | Source File | - | - | - |
| `packages/auth/src/current-user.ts` | Source File | getAuthUser, getCurrentUser | @qoe/db/types, @qoe/supabase/server, react, @qoe/config, @qoe/db/client, ./permissions, @supabase/supabase-js, next/navigation | - |
| `packages/auth/src/index.ts` | Source File | - | - | - |
| `packages/auth/src/permissions.ts` | Source File | Action, can, require, PermissionError | @qoe/config, ./roles | - |
| `packages/auth/src/roles.ts` | Source File | hasRoleLevel, isSuperadmin, isCreator | @qoe/config | - |
| `packages/auth/tsconfig.json` | Source File | - | - | - |
| `packages/billing/package.json` | Source File | - | - | - |
| `packages/billing/src/client.ts` | Source File | stripe | stripe | - |
| `packages/billing/src/index.ts` | Source File | - | - | - |
| `packages/billing/src/plans.ts` | Source File | SUBSCRIPTION_TIERS, SubscriptionTierId, CREATOR_PLANS, CreatorPlanId, calculateFee | - | - |
| `packages/billing/src/webhooks.ts` | Source File | WEBHOOK_HANDLERS | @qoe/db/client, stripe, ./client, ./plans | - |
| `packages/billing/tsconfig.json` | Source File | - | - | - |
| `packages/config/package.json` | Source File | - | - | - |
| `packages/config/src/constants.ts` | Source File | ROLES, Role, ROLE_HIERARCHY, TENANT_LAYOUTS, TenantLayout, THEME_MODES, ThemeMode, POST_VISIBILITY, PostVisibility, WALLET_TRANSACTION_TYPES, WalletTransactionType, LIMITS, URLS, LANGUAGES, Language, ALL_LANGUAGES, DEFAULT_LANGUAGE | - | - |
| `packages/config/src/env.ts` | Source File | parseEnv, env, Env | @qoe/config/env, zod | - |
| `packages/config/src/features.ts` | Source File | FEATURE_FLAGS, FeatureFlag, isFeatureEnabled | - | - |
| `packages/config/src/index.ts` | Source File | - | @qoe/config | - |
| `packages/config/tsconfig.json` | Source File | - | - | - |
| `packages/db/package.json` | Source File | - | - | - |
| `packages/db/prisma/schema.prisma` | Prisma Database Schema | - | - | - |
| `packages/db/prisma/seed.ts` | Source File | - | @prisma/client | - |
| `packages/db/src/client.ts` | Prisma Client Singleton | prisma | @prisma/client, @qoe/db/client | - |
| `packages/db/src/index.ts` | Source File | - | - | - |
| `packages/db/src/repositories/articles.ts` | Source File | - | ../client, @prisma/client | - |
| `packages/db/src/repositories/posts.ts` | Source File | - | @qoe/config, ../client, @prisma/client | - |
| `packages/db/src/repositories/users.ts` | Source File | - | @qoe/config, ../client, @prisma/client | - |
| `packages/db/src/types.ts` | Source File | - | - | - |
| `packages/db/tsconfig.json` | Source File | - | - | - |
| `packages/i18n/package.json` | Source File | - | - | - |
| `packages/i18n/src/compiler.ts` | Source File | compilePlural, interpolate | - | - |
| `packages/i18n/src/index.ts` | Source File | - | - | - |
| `packages/i18n/src/locales.ts` | Source File | ALL_LANGUAGES, DEFAULT_LANGUAGE | @qoe/config | - |
| `packages/i18n/src/provider.tsx` | Source File | useTranslate, useTolgee, TolgeeNextProvider | ./compiler, react, ./locales, ../../../messages/fr.json, ../../../messages/en.json | Context |
| `packages/i18n/src/server.ts` | Source File | getCachedOverrides, translateKey | ./compiler, next/cache, @qoe/db/client, ./locales, ../../../messages/fr.json, ../../../messages/en.json | Cookies |
| `packages/i18n/tsconfig.json` | Source File | - | - | - |
| `packages/supabase/package.json` | Source File | - | - | - |
| `packages/supabase/src/client.ts` | Source File | createClient | ./cookie-config, @supabase/ssr | Cookies |
| `packages/supabase/src/cookie-config.ts` | Source File | getCookieDomain | - | - |
| `packages/supabase/src/index.ts` | Source File | - | - | - |
| `packages/supabase/src/middleware.ts` | Source File | - | next/server, ./cookie-config, @supabase/ssr | - |
| `packages/supabase/src/server.ts` | Source File | createServiceClient | ./cookie-config, @supabase/ssr, next/headers | Cookies |
| `packages/supabase/src/sso.ts` | Source File | - | - | - |
| `packages/supabase/tsconfig.json` | Source File | - | - | - |
| `packages/theme/package.json` | Source File | - | - | - |
| `packages/theme/src/ThemeProvider.tsx` | Source File | ThemeProvider | react, next-themes | - |
| `packages/theme/src/ThemeStyle.tsx` | Source File | buildCreatorVars, ThemeStyle | react, ./types | - |
| `packages/theme/src/index.ts` | Source File | - | @qoe/theme | - |
| `packages/theme/src/registry.ts` | Source File | THEMES, ACCENTS, ThemeId, AccentId, resolveForcedTheme, resolveAccentFromColor | ./types | - |
| `packages/theme/src/tokens.ts` | Source File | token, tokens | - | - |
| `packages/theme/src/types.ts` | Source File | ThemeMode, AccentVariant, CreatorTheme | - | - |
| `packages/theme/tsconfig.json` | Source File | - | - | - |
| `packages/tsconfig/base.json` | Source File | - | - | - |
| `packages/tsconfig/nextjs.json` | Source File | - | - | - |
| `packages/tsconfig/node.json` | Source File | - | - | - |
| `packages/tsconfig/package.json` | Source File | - | - | - |
| `packages/tsconfig/react-library.json` | Source File | - | - | - |
| `packages/ui/package.json` | Shared UI Component | - | - | - |
| `packages/ui/src/Logo.tsx` | Shared UI Component | Logo | react, @qoe/utils | - |
| `packages/ui/src/SocialIcon.tsx` | Shared UI Component | SocialIcon | react, lucide-react | - |
| `packages/ui/src/SubscribeForm.tsx` | Shared UI Component | SubscribeForm | react, lucide-react | useState |
| `packages/ui/src/TenantHeader.tsx` | Shared UI Component | TenantHeader | @qoe/db/types, react, next/link, ./SocialIcon, lucide-react | - |
| `packages/ui/src/button.tsx` | Shared UI Component | ButtonProps | react, @qoe/ui/button, class-variance-authority, @qoe/utils | - |
| `packages/ui/src/card.tsx` | Shared UI Component | - | react, @qoe/utils | - |
| `packages/ui/src/devtools/DevtoolsPanel.tsx` | Shared UI Component | DevtoolsActions, DevtoolsPanel | react, @qoe/supabase/client, ./actions | useState, useEffect, localStorage |
| `packages/ui/src/devtools/actions.ts` | Shared UI Component | DevtoolsUser, DevtoolsStats | @qoe/db/client, @qoe/supabase/server, crypto | - |
| `packages/ui/src/index.ts` | Shared UI Component | - | - | - |
| `packages/ui/src/theme-provider.tsx` | Shared UI Component | - | - | - |
| `packages/ui/src/tokens.ts` | Shared UI Component | COLORS, SPACING, FONTS, BREAKPOINTS, DURATIONS | - | - |
| `packages/ui/tsconfig.json` | Shared UI Component | - | - | - |
| `packages/utils/package.json` | Source File | - | - | - |
| `packages/utils/src/cn.ts` | Source File | cn | tailwind-merge, clsx | - |
| `packages/utils/src/format.ts` | Source File | formatCurrency, formatNumber, formatDuration, formatReadingTime, formatRelativeDate, truncate, maskEmail | - | - |
| `packages/utils/src/index.ts` | Source File | - | - | - |
| `packages/utils/src/slugify.ts` | Source File | slugify, shortId, uuid | - | - |
| `packages/utils/src/validation.ts` | Source File | emailSchema, slugSchema, uuidSchema, usernameSchema, postContentSchema, articleTitleSchema, centsSchema | zod | - |
| `packages/utils/tsconfig.json` | Source File | - | - | - |
| `plans/dashboard-creator-roadmap.md` | Source File | - | - | - |
| `plans/theming-architecture.md` | Source File | - | - | - |
| `pnpm-lock.yaml` | Source File | - | - | - |
| `pnpm-workspace.yaml` | Source File | - | - | - |
| `postcss.config.mjs` | Source File | - | - | - |
| `prisma.config.ts` | Source File | - | prisma/config | - |
| `scripts/backup-postgres.sh` | Source File | - | - | - |
| `scripts/deploy.sh` | Source File | - | - | - |
| `scripts/seed-docker.sh` | Source File | - | - | - |
| `scripts/wait-for-db.sh` | Source File | - | - | - |
| `seed.ts` | Source File | - | @prisma/client | - |
| `setup-pgvector.ts` | Source File | - | @prisma/client | - |
| `skills-lock.json` | Source File | - | - | - |
| `tsconfig.json` | Source File | - | - | - |
| `turbo.json` | Source File | - | - | - |
| `vitest.config.ts` | Source File | - | vitest/config, @vitejs/plugin-react, path | - |
| `workers/Dockerfile` | Source File | - | - | - |
| `workers/package.json` | Source File | - | - | - |
| `workers/src/index.ts` | Source File | - | - | - |
| `workers/tsconfig.json` | Source File | - | - | - |
| `workers/tsup.config.ts` | Source File | - | tsup | - |

## 4. Data Schemas, Types & Contract Map
- **Data Lifecycle Matrix**: Client Request -> UI Component -> Server Action / API Route -> Validation (Zod) -> DB Repository (Prisma) -> Database (Postgres) -> Response.

### Complete Registry of Data Models and Schemas

**Prisma Models:**
- `ApiKey`
- `Article`
- `BlockedUser`
- `Bookmark`
- `Category`
- `Follows`
- `Highlight`
- `Letter`
- `Like`
- `MutedWord`
- `NavigationItem`
- `PartnerPromo`
- `Post`
- `SocialLink`
- `Subscriber`
- `SystemConfig`
- `TranslationAuditLog`
- `Trend`
- `User`
- `WalletTransaction`

**Zod Validation Schemas:**
- `clientSchema`
- `envSchema`
- `uuidSchema`

## 5. Dependency & Blast Radius Matrix (Impact Analysis)
A reverse-lookup table showing component and utility usage. This prevents unintended breaking changes:

| FOCAL FILE | DEPENDENT FILES (Who imports this?) | RISKS / BREAKING POINT IF MODIFIED |
| :--- | :--- | :--- |
| `packages/db/src/client.ts` | `apps/admin/next.config.ts`<br>`apps/admin/src/app/(admin)/admin/actions.ts`<br>`apps/admin/src/app/(admin)/admin/api/actions.ts`<br>`apps/admin/src/app/(admin)/admin/api/page.tsx`<br>`apps/admin/src/app/(admin)/admin/components/AdminHeader.tsx`<br>`apps/admin/src/app/(admin)/admin/config/actions.ts`<br>`apps/admin/src/app/(admin)/admin/config/page.tsx`<br>`apps/admin/src/app/(admin)/admin/frontend/actions.ts`<br>`apps/admin/src/app/(admin)/admin/frontend/page.tsx`<br>`apps/admin/src/app/(admin)/admin/layout.tsx`<br>...and 50 more | Will break database connections and queries across all apps. |
| `packages/auth/src/index.ts` | `apps/admin/next.config.ts`<br>`apps/dashboard/next.config.ts`<br>`apps/dashboard/src/app/(creator)/articles/actions.ts`<br>`apps/dashboard/src/app/(creator)/developer/page.tsx`<br>`apps/dashboard/src/app/(creator)/layout.tsx`<br>`apps/dashboard/src/app/(creator)/page.tsx`<br>`apps/dashboard/src/app/api/articles/upload/route.ts`<br>`apps/dashboard/src/app/onboarding/page.tsx`<br>`apps/dashboard/src/features/developer/actions.ts`<br>`apps/dashboard/src/features/onboarding/actions.ts`<br>...and 6 more | Will break authentication and authorization logic. |
| `packages/ui/src/index.ts` | `apps/admin/next.config.ts`<br>`apps/admin/src/app/layout.tsx`<br>`apps/admin/src/components/feed/PublicFeedPreview.tsx`<br>`apps/dashboard/next.config.ts`<br>`apps/dashboard/src/app/layout.tsx`<br>`apps/dashboard/src/components/feed/PublicFeedPreview.tsx`<br>`apps/dashboard/src/features/dashboard/components/app-sidebar.tsx`<br>`apps/feed/next.config.ts`<br>`apps/feed/src/app/layout.tsx`<br>`apps/feed/src/components/feed/PublicFeedPreview.tsx`<br>...and 11 more | Will break shared UI components and design systems. |
| `packages/config/src/routes.ts` | All apps (`feed`, `dashboard`, `admin`, `landing`, `web`) | Central Type-Safe Route Registry. Modifying signature updates all monorepo navigation. |
| `packages/config/src/env.ts` | `apps/admin/next.config.ts`<br>`apps/admin/src/components/feed/PublicFeedPreview.tsx`<br>`apps/dashboard/next.config.ts`<br>`apps/dashboard/src/app/api/articles/upload/route.ts`<br>`apps/dashboard/src/components/feed/PublicFeedPreview.tsx`<br>`apps/feed/next.config.ts`<br>`apps/feed/src/app/(reader)/settings/SettingsDashboard.tsx`<br>`apps/feed/src/components/feed/PublicFeedPreview.tsx`<br>`apps/feed/src/components/layout/AppSidebar.tsx`<br>`apps/landing/next.config.ts`<br>...and 15 more | Will break environment variable validation and app initialization. |
| `packages/supabase/src/server.ts` | `apps/admin/middleware.ts`<br>`apps/admin/next.config.ts`<br>`apps/admin/src/app/(admin)/admin/actions.ts`<br>`apps/admin/src/app/(admin)/admin/api/actions.ts`<br>`apps/admin/src/app/(admin)/admin/config/actions.ts`<br>`apps/admin/src/app/(admin)/admin/frontend/actions.ts`<br>`apps/admin/src/app/(admin)/admin/layout.tsx`<br>`apps/admin/src/app/login/actions.ts`<br>`apps/admin/src/features/dashboard/components/app-sidebar.tsx`<br>`apps/admin/src/lib/safe-action.ts`<br>...and 38 more | Will break SSR authentication and server-side Supabase calls. |
| `packages/supabase/src/client.ts` | `apps/admin/middleware.ts`<br>`apps/admin/next.config.ts`<br>`apps/admin/src/app/(admin)/admin/actions.ts`<br>`apps/admin/src/app/(admin)/admin/api/actions.ts`<br>`apps/admin/src/app/(admin)/admin/config/actions.ts`<br>`apps/admin/src/app/(admin)/admin/frontend/actions.ts`<br>`apps/admin/src/app/(admin)/admin/layout.tsx`<br>`apps/admin/src/app/login/actions.ts`<br>`apps/admin/src/features/dashboard/components/app-sidebar.tsx`<br>`apps/admin/src/lib/safe-action.ts`<br>...and 38 more | Will break client-side authentication and Supabase calls. |

## 6. Endpoints, Routes & Middleware Registry
Table of all UI pages, API endpoints, Server Actions, and Middlewares:

| Route Path / Endpoint | Source File | Auth & Permission Level | Associated Services & Data Sources |
| :--- | :--- | :--- | :--- |
| `[admin] /` | `apps/admin/src/app/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] /(admin)/admin` | `apps/admin/src/app/(admin)/admin/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] /(admin)/admin/api` | `apps/admin/src/app/(admin)/admin/api/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] /(admin)/admin/config` | `apps/admin/src/app/(admin)/admin/config/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] /(admin)/admin/frontend` | `apps/admin/src/app/(admin)/admin/frontend/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] /(admin)/admin/translations` | `apps/admin/src/app/(admin)/admin/translations/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] /(admin)/admin/users` | `apps/admin/src/app/(admin)/admin/users/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] /(admin)/admin/users/[id]` | `apps/admin/src/app/(admin)/admin/users/[id]/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] /(admin)/admin/widgets` | `apps/admin/src/app/(admin)/admin/widgets/page.tsx` | Admin | Next.js App Router (UI Page) |
| `[admin] Middleware` | `apps/admin/middleware.ts` | System | Next.js Middleware (Supabase Session, Routing) |
| `[api] GET /health` | `apps/api/src/index.ts` | Inferred from Hono middleware | Hono API |
| `[api] GET /v1/articles` | `apps/api/src/index.ts` | Inferred from Hono middleware | Hono API |
| `[api] GET /v1/articles/:slug` | `apps/api/src/index.ts` | Inferred from Hono middleware | Hono API |
| `[api] GET /v1/categories` | `apps/api/src/index.ts` | Inferred from Hono middleware | Hono API |
| `[api] GET /v1/users/:username` | `apps/api/src/index.ts` | Inferred from Hono middleware | Hono API |
| `[api] POST /webhooks/stripe` | `apps/api/src/index.ts` | Inferred from Hono middleware | Hono API |
| `[api] POST /webhooks/supabase` | `apps/api/src/index.ts` | Inferred from Hono middleware | Hono API |
| `[dashboard] /(creator)` | `apps/dashboard/src/app/(creator)/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /(creator)/analytics` | `apps/dashboard/src/app/(creator)/analytics/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /(creator)/articles` | `apps/dashboard/src/app/(creator)/articles/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /(creator)/articles/[id]` | `apps/dashboard/src/app/(creator)/articles/[id]/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /(creator)/articles/new` | `apps/dashboard/src/app/(creator)/articles/new/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /(creator)/audience` | `apps/dashboard/src/app/(creator)/audience/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /(creator)/developer` | `apps/dashboard/src/app/(creator)/developer/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /(creator)/newsletters` | `apps/dashboard/src/app/(creator)/newsletters/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /(creator)/settings` | `apps/dashboard/src/app/(creator)/settings/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] /api/articles/upload` | `apps/dashboard/src/app/api/articles/upload/route.ts` | Protected (Creator) | Next.js App Router (API Route) |
| `[dashboard] /onboarding` | `apps/dashboard/src/app/onboarding/page.tsx` | Protected (Creator) | Next.js App Router (UI Page) |
| `[dashboard] Middleware` | `apps/dashboard/middleware.ts` | System | Next.js Middleware (Supabase Session, Routing) |
| `[feed] /` | `apps/feed/src/app/page.tsx` | Protected (User) | Next.js App Router (UI Page) |
| `[feed] /(reader)/billing` | `apps/feed/src/app/(reader)/billing/page.tsx` | Protected (User) | Next.js App Router (UI Page) |
| `[feed] /(reader)/highlights` | `apps/feed/src/app/(reader)/highlights/page.tsx` | Protected (User) | Next.js App Router (UI Page) |
| `[feed] /(reader)/home` | `apps/feed/src/app/(reader)/home/page.tsx` | Protected (User) | Next.js App Router (UI Page) |
| `[feed] /(reader)/library` | `apps/feed/src/app/(reader)/library/page.tsx` | Protected (User) | Next.js App Router (UI Page) |
| `[feed] /(reader)/onboarding` | `apps/feed/src/app/(reader)/onboarding/page.tsx` | Protected (User) | Next.js App Router (UI Page) |
| `[feed] /(reader)/settings` | `apps/feed/src/app/(reader)/settings/page.tsx` | Protected (User) | Next.js App Router (UI Page) |
| `[feed] /api/upload` | `apps/feed/src/app/api/upload/route.ts` | Protected (User) | Next.js App Router (API Route) |
| `[feed] /auth/callback` | `apps/feed/src/app/auth/callback/route.ts` | Protected (User) | Next.js App Router (API Route) |
| `[feed] /auth/sso/sync` | `apps/feed/src/app/auth/sso/sync/route.ts` | Protected (User) | Next.js App Router (API Route) |
| `[feed] /login` | `apps/feed/src/app/login/page.tsx` | Public | Next.js App Router (UI Page) |
| `[feed] Middleware` | `apps/feed/middleware.ts` | System | Next.js Middleware (Supabase Session, Routing) |
| `[landing] /` | `apps/landing/src/app/page.tsx` | Public | Next.js App Router (UI Page) |
| `[web] /` | `apps/web/src/app/page.tsx` | Public | Next.js App Router (UI Page) |
| `[web] /api/articles/upload` | `apps/web/src/app/api/articles/upload/route.ts` | Public | Next.js App Router (API Route) |
| `[web] /auth/sso/callback` | `apps/web/src/app/auth/sso/callback/route.ts` | Public | Next.js App Router (API Route) |
| `[web] /tenant/[domain]` | `apps/web/src/app/tenant/[domain]/page.tsx` | Public | Next.js App Router (UI Page) |
| `[web] /tenant/[domain]/article/[slug]` | `apps/web/src/app/tenant/[domain]/article/[slug]/page.tsx` | Public | Next.js App Router (UI Page) |
| `[web] Middleware` | `apps/web/src/middleware.ts` | System | Next.js Middleware (Supabase Session, Routing) |

## 7. Golden Rules, Gotchas & Anti-Patterns

### Explicit Coding Conventions
- **Server Components Cookies**: In Next.js Server Components, cookies are read-only. Methods attempting to write cookies (like `cookieStore.set`) will throw errors and must be gracefully caught/swallowed. Do NOT try to set cookies directly in Server Components.
- **Hardcoding**: Nothing should be hardcoded. Use Tolgee for i18n or the superadmin dashboard (`SystemConfig`) for global settings.
- **Testing**: Testing must exclusively use Vitest along with `@testing-library/react` and `jsdom`. Do not use Jest.
- **Package Isolation**: Apps should not import directly from each other. They must only import from `@qoe/*` packages or their own local files. The UI components must be centralized in `packages/ui`.
- **Database Source of Truth**: The single source of truth for Prisma is `packages/db/prisma/schema.prisma`. Do NOT create another `prisma` folder at the root.

### Environment Variables Index
Extracted environment variables used across the codebase:
- `ANTHROPIC_API_KEY`
- `DATABASE_URL`
- `DEFAULT_LANGUAGE`
- `DIRECT_URL`
- `FEATURE_AI_RECOS`
- `FEATURE_BILLING`
- `FEATURE_CUSTOM_DOMAINS`
- `FEATURE_HIGHLIGHTS`
- `FEATURE_LETTERS`
- `FEATURE_MICROPOSTS`
- `FEATURE_NEWSLETTERS`
- `FEATURE_REALTIME`
- `FEATURE_RICH_EDITOR`
- `FEATURE_SEMANTIC_SEARCH`
- `HOSTNAME`
- `NEXT_PHASE`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CONSOLE_URL`
- `NEXT_PUBLIC_DASHBOARD_URL`
- `NEXT_PUBLIC_DEV_TENANT_SUFFIX`
- `NEXT_PUBLIC_LANDING_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_TOLGEE_API_KEY`
- `NEXT_PUBLIC_TOLGEE_API_URL`
- `NEXT_PUBLIC_UMAMI_SCRIPT_URL`
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
- `NEXT_TELEMETRY_DISABLED`
- `NODE_ENV`
- `OPENAI_API_KEY`
- `PORT`
- `POSTGRES_DB`
- `POSTGRES_INITDB_ARGS`
- `POSTGRES_PASSWORD`
- `POSTGRES_USER`
- `SSO_JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

### Known Technical Debt & Gotchas (TODOs/FIXMEs)
- "https://mastodon.social", order: 3, userId: dbUser.id },
- 'https://mastodon.social/@mediamilitant', order: 4, userId },
- HTMLElement, textToHighlight: string, note?: string) => {
- Wire to real server action when tenant routing is implemented
- brancher sur @qoe/i18n/setLanguage quand implémenté
- implémenter avec @qoe/analytics ou package dédié
- re-enable when extension is wired
- return (
- s'assurer que seuls les créateurs accèdent au dashboard

## 8. AI Navigation & Feature Matrix
Quick lookup guide for future AI coding sessions:

| Goal / Feature Modification | Files to Edit | Context Files to Inspect First | Safety Checks to Run |
| :--- | :--- | :--- | :--- |
| *Add/Modify DB Field* | `packages/db/prisma/schema.prisma` | `packages/db/src/client.ts`, `packages/db/src/types.ts` | Run `pnpm prisma:generate` & check Zod schemas in `packages/config/src` |
| *Create new UI Component* | `packages/ui/src/components/*`, `packages/ui/src/index.ts` | `packages/ui/src/lib/utils.ts`, `tailwind.config.js` | Run `pnpm test:ui` & check exports |
| *Modify Auth Flow* | `packages/auth/src/*`, `packages/supabase/src/*` | `apps/feed/src/app/login/*`, `middleware.ts` | Verify SSR cookie logic (read-only constraint) |
| *Add new API Endpoint* | `apps/api/src/routes/*` | `apps/api/src/index.ts` | Run `pnpm typecheck` & check Hono middleware |
| *Update Global Config/CMS* | `packages/db/prisma/schema.prisma` (SystemConfig) | `apps/admin/src/app/page.tsx` | Ensure `SystemConfig` updates don't break `apps/landing` |
| *Modify Multi-tenant Blog* | `apps/web/src/app/[domain]/*` | `apps/web/src/middleware.ts` | Check Caddy proxy routing rules |
| *Update Pricing/Stripe* | `packages/billing/src/*` | `apps/dashboard/src/app/billing/*` | Verify Stripe webhooks and DB `WalletTransaction` |

