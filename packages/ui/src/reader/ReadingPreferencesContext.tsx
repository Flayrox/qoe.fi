'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@qoe/supabase/client';
import {
  DEFAULT_READING_PREFERENCES,
  type ReadingPreferences,
  type ReadingPreferencesContextValue,
} from './types';

const STORAGE_KEY = 'qoe-reading-prefs-v1';
const COOKIE_NAME = 'qoe_reading_prefs';
const PARENT_DOMAIN = 'qoe.fi';
const CHANGE_EVENT = 'qoe-reading-prefs-changed';

export function getCookieDomain(): string | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return null;
  if (hostname.endsWith(PARENT_DOMAIN)) return `.${PARENT_DOMAIN}`;
  return null;
}

export function readCookiePrefs(): Partial<ReadingPreferences> | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
    if (!match) return null;
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function writeCookiePrefs(prefs: ReadingPreferences) {
  if (typeof document === 'undefined') return;
  const domain = getCookieDomain();
  const domainAttr = domain ? `; domain=${domain}` : '';
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(prefs))}; path=/; max-age=${maxAge}; SameSite=Lax${domainAttr}${secure}`;
}

export function removeCookiePrefs() {
  if (typeof document === 'undefined') return;
  const domain = getCookieDomain();
  const domainAttr = domain ? `; domain=${domain}` : '';
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0${domainAttr}`;
}

const ReadingPreferencesContext = createContext<ReadingPreferencesContextValue>({
  preferences: DEFAULT_READING_PREFERENCES,
  update: () => {},
  reset: () => {},
});

export function ReadingPreferencesProvider({
  children,
  initialPreferences,
}: {
  children: React.ReactNode;
  initialPreferences?: Partial<ReadingPreferences>;
}) {
  const [preferences, setPreferences] = useState<ReadingPreferences>(() => {
    return {
      ...DEFAULT_READING_PREFERENCES,
      ...(initialPreferences ?? {}),
    };
  });

  // Load from cross-subdomain cookie + localStorage on mount, then sync with Supabase if logged in
  useEffect(() => {
    let localPrefs: Partial<ReadingPreferences> | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        localPrefs = JSON.parse(stored) as Partial<ReadingPreferences>;
      }
    } catch {
      // Ignore parse/storage errors
    }

    const cookiePrefs = readCookiePrefs();

    const merged = {
      ...localPrefs,
      ...cookiePrefs,
      ...(initialPreferences ?? {}),
    };

    setPreferences((prev) => ({
      ...prev,
      ...merged,
    }));

    // If logged in to Supabase, merge remote user_metadata preferences
    try {
      const supabase = createClient();
      supabase.auth
        .getUser()
        .then(({ data }) => {
          const remotePrefs = data?.user?.user_metadata?.reading_preferences as
            Partial<ReadingPreferences> | undefined;
          if (remotePrefs && typeof remotePrefs === 'object') {
            setPreferences((prev) => {
              const updated = { ...prev, ...remotePrefs };
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                writeCookiePrefs(updated);
              } catch {}
              return updated;
            });
          }
        })
        .catch(() => {});
    } catch {
      // Ignore in test/SSR
    }
  }, [initialPreferences]);

  // Real-time synchronization across browser tabs and components in same window
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setPreferences((prev) => ({ ...prev, ...parsed }));
        } catch {}
      }
    };

    const handleCustomChange = (e: Event) => {
      const detail = (e as CustomEvent<ReadingPreferences>).detail;
      if (detail) {
        setPreferences(detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(CHANGE_EVENT, handleCustomChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(CHANGE_EVENT, handleCustomChange);
    };
  }, []);

  const update = (patch: Partial<ReadingPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };

      // 1. LocalStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}

      // 2. Cross-subdomain cookie (.qoe.fi)
      try {
        writeCookiePrefs(next);
      } catch {}

      // 3. Dispatch to other components in same window
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
      }

      // 4. Supabase cloud sync for authenticated user
      try {
        const supabase = createClient();
        supabase.auth
          .updateUser({
            data: { reading_preferences: next },
          })
          .catch(() => {});
      } catch {}

      return next;
    });
  };

  const reset = () => {
    setPreferences(DEFAULT_READING_PREFERENCES);
    try {
      localStorage.removeItem(STORAGE_KEY);
      removeCookiePrefs();
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: DEFAULT_READING_PREFERENCES }));
    }

    try {
      const supabase = createClient();
      supabase.auth
        .updateUser({
          data: { reading_preferences: DEFAULT_READING_PREFERENCES },
        })
        .catch(() => {});
    } catch {}
  };

  const value = useMemo(
    () => ({
      preferences,
      update,
      reset,
    }),
    [preferences]
  );

  return (
    <ReadingPreferencesContext.Provider value={value}>
      {children}
    </ReadingPreferencesContext.Provider>
  );
}

export function useReadingPreferences(): ReadingPreferencesContextValue {
  return useContext(ReadingPreferencesContext);
}

/**
 * Returns the CSS classes to apply to the article reader container
 * based on the active reading preferences.
 */
export function getReaderTypographyClasses(prefs: ReadingPreferences): string {
  const classes: string[] = [];

  // 1. Font Family
  switch (prefs.fontFamily) {
    case 'font-serif':
      classes.push('font-serif');
      break;
    case 'font-sans':
      classes.push('font-sans');
      break;
    case 'font-dyslexic':
      classes.push('font-dyslexic font-sans tracking-wide leading-relaxed');
      break;
    default:
      classes.push('font-serif');
      break;
  }

  // 2. Font Size
  switch (prefs.fontSize) {
    case 'sm':
      classes.push('text-[14px]');
      break;
    case 'base':
      classes.push('text-[16px]');
      break;
    case 'lg':
      classes.push('text-[18px]');
      break;
    case 'xl':
      classes.push('text-[20px]');
      break;
    case '2xl':
      classes.push('text-[23px]');
      break;
  }

  // 3. Line Height
  switch (prefs.lineHeight) {
    case 'compact':
      classes.push('leading-snug');
      break;
    case 'normal':
      classes.push('leading-relaxed');
      break;
    case 'relaxed':
      classes.push('leading-loose tracking-[0.015em]');
      break;
  }

  // 4. Max Reading Column Width
  switch (prefs.readingWidth) {
    case 'narrow':
      classes.push('max-w-[580px] mx-auto');
      break;
    case 'normal':
      classes.push('max-w-[680px] mx-auto');
      break;
    case 'wide':
      classes.push('max-w-[820px] mx-auto');
      break;
  }

  return classes.join(' ');
}

/**
 * Returns the Paper Theme CSS classes
 */
export function getPaperThemeClasses(theme: ReadingPreferences['paperTheme']): string {
  switch (theme) {
    case 'sepia':
      return 'bg-[#FBF0D9] text-[#3D2E1E] selection:bg-[#E8D4B0] border-[#EAD8B8]';
    case 'slate':
      return 'bg-[#1E2024] text-[#E2E4E8] selection:bg-[#343840] border-[#2A2E35]';
    case 'oled':
      return 'bg-[#000000] text-[#FFFFFF] selection:bg-[#2A2A2A] border-[#1C1C1C]';
    case 'default':
    default:
      return 'bg-background text-foreground';
  }
}
