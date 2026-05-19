/**
 * @deprecated This module is replaced by the Tolgee SDK.
 * Use `getTranslate` from `@/tolgee/server` for Server Components.
 * Use `useTranslate` from `@tolgee/react` for Client Components.
 * Use `getLanguage` from `@/tolgee/language` for locale detection.
 *
 * This file is kept temporarily for backward compatibility during migration.
 * It will be removed in a future cleanup pass.
 */

export { getLanguage as getLocale } from '@/tolgee/language'
export type { AppLocale as Locale } from '@/tolgee/shared'

// Legacy getDictionary is no longer available.
// Use `const t = await getTranslate()` from `@/tolgee/server` instead.
