# `apps/admin` (Super Admin)

**Role:** The global oversight platform (`admin.qoe.fi`). Configures global settings and moderates all ecosystem entities. Access is strictly constrained by `@qoe/auth` `ROLES.SUPERADMIN`.

## Core Mechanisms

- **System Config:** Modifies generic data that powers `apps/landing`.
- **Translations:** Interfaces with `@qoe/i18n` to correct copy globally.

## File Exhaustive Listing

_(Partial listed here for brevity, see tree for full structure including `src/app/(admin)/...`)_

- `package.json`
- `next.config.ts`
- `middleware.ts`
- `src/app/(admin)/admin/page.tsx`
