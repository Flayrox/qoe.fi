import { cookies, headers } from 'next/headers'

export type Locale = 'fr' | 'en'

export async function getLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies()
    const localeCookie = cookieStore.get('NEXT_LOCALE')?.value as Locale
    if (localeCookie === 'fr' || localeCookie === 'en') return localeCookie
  } catch (e) {
    // Ignore errors during static generation
  }

  try {
    const headersList = await headers()
    const acceptLanguage = headersList.get('accept-language') || ''
    if (acceptLanguage.toLowerCase().startsWith('en') || acceptLanguage.toLowerCase().includes('en-')) {
      return 'en'
    }
  } catch (e) {
    // Ignore errors during static generation
  }

  return 'fr' // fallback default
}

export async function getDictionary() {
  const locale = await getLocale()
  return locale === 'en'
    ? import('@/locales/en.json').then((m) => m.default)
    : import('@/locales/fr.json').then((m) => m.default)
}
