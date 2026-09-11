import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_VERSION,
  defaultChoice,
  parseConsentCookie,
} from '@qoe/utils/cookie-consent';
import {
  openCookiePreferences,
  readLocalConsent,
  subscribeCookiePreferences,
  writeConsent,
} from '../legal/cookie-consent-storage';

// localStorage de Node 22 sans --localstorage-file shadowe celui de jsdom.
if (!window.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

function readCookieRaw(): string | undefined {
  const found = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_CONSENT_COOKIE}=`));
  return found?.slice(COOKIE_CONSENT_COOKIE.length + 1);
}

describe('🍪 cookie-consent-storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${COOKIE_CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  });

  it('écrit puis relit le choix dans le stockage local', () => {
    writeConsent({ ...defaultChoice(), analytics: true, decidedAt: new Date().toISOString() });
    expect(readLocalConsent()?.analytics).toBe(true);
    expect(window.localStorage.getItem(COOKIE_CONSENT_KEY)).toContain('"analytics":true');
  });

  it('pose un cookie lisible côté serveur (AnalyticsGate)', () => {
    writeConsent({ ...defaultChoice(), analytics: true, decidedAt: new Date().toISOString() });
    expect(parseConsentCookie(readCookieRaw())?.analytics).toBe(true);
  });

  it('refuse est bien une décision enregistrée (pas une absence de choix)', () => {
    writeConsent({ ...defaultChoice(), decidedAt: new Date().toISOString() });
    const stored = readLocalConsent();
    expect(stored).not.toBeNull();
    expect(stored?.version).toBe(COOKIE_CONSENT_VERSION);
    expect(stored?.analytics).toBe(false);
  });

  it('notifie les abonnés au clic sur « Gérer mes cookies »', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeCookiePreferences(handler);
    openCookiePreferences();
    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe();
    openCookiePreferences();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
