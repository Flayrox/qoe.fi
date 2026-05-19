'use server';

import { detectLanguageFromHeaders } from '@tolgee/react/server';
import { cookies, headers } from 'next/headers';
import { ALL_LANGUAGES, DEFAULT_LANGUAGE, type AppLocale } from './locales';

const LANGUAGE_COOKIE = 'NEXT_LOCALE';

export async function setLanguage(locale: string) {
  const cookieStore = await cookies();
  cookieStore.set(LANGUAGE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365, // 1 year in seconds
    path: '/',
    sameSite: 'lax',
  });
}

export async function getLanguage(): Promise<AppLocale> {
  // 1. Check custom x-locale header set by middleware (Option A / Option B hybrid)
  const headersStore = await headers();
  const xLocale = headersStore.get('x-locale');
  if (xLocale && (ALL_LANGUAGES as readonly string[]).includes(xLocale)) {
    return xLocale as AppLocale;
  }

  // 2. Check explicit cookie preference
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LANGUAGE_COOKIE)?.value;
  if (localeCookie && (ALL_LANGUAGES as readonly string[]).includes(localeCookie)) {
    return localeCookie as AppLocale;
  }

  // 3. Auto-detect from Accept-Language header
  const detected = detectLanguageFromHeaders(
    headersStore,
    ALL_LANGUAGES as unknown as string[]
  );
  if (detected) {
    return detected as AppLocale;
  }

  // 4. Fallback to default
  return DEFAULT_LANGUAGE;
}
