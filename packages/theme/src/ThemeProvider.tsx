'use client';

// ═══════════════════════════════════════════════════════════════════
// 🌗 @qoe/theme — ThemeProvider.tsx
// Wrapper next-themes (light/dark/system), source unique pour toutes les apps.
// Synchronise le thème entre les sous-domaines (qoe.fi ↔ dashboard.qoe.fi
// ↔ admin.qoe.fi...) via un cookie partagé sur le domaine parent.
// ═══════════════════════════════════════════════════════════════════

import * as React from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { readThemeCookie, writeThemeCookie, THEME_COOKIE_POLL_MS } from './cookie';

// Silence le faux positif React 19 sur les <script> en dev
// (next-themes en injecte un pour éviter le FOUC). Le warning est émis par
// react-dom pendant l'hydratation ET pendant le rendu SSR (puis forwardé au
// client par React Flight) : on filtre donc dans les deux contextes, en
// inspectant tous les arguments (pas seulement le premier).
const SCRIPT_TAG_WARNING = 'Encountered a script tag while rendering React component';
if (process.env.NODE_ENV === 'development') {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    const message = args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.message;
        return '';
      })
      .join(' ');
    if (message.includes(SCRIPT_TAG_WARNING)) {
      return;
    }
    orig.apply(console, args);
  };
}

const VALID_THEMES = new Set(['light', 'dark']);

/** Écrit le cookie partagé à chaque changement de thème local. */
function CookieWriter() {
  const { theme } = useTheme();

  React.useEffect(() => {
    if (theme && VALID_THEMES.has(theme)) {
      writeThemeCookie(theme);
    }
  }, [theme]);

  return null;
}

/**
 * Lit le cookie partagé au montage, puis surveille les changements
 * venant d'autres onglets/sous-domaines (polling + event focus/visibility)
 * et applique le thème correspondant via next-themes.
 */
function CookieReader() {
  const { resolvedTheme, setTheme } = useTheme();
  const applied = React.useRef<string | null>(null);

  const syncFromCookie = React.useCallback(() => {
    const cookie = readThemeCookie();
    if (cookie && VALID_THEMES.has(cookie) && cookie !== applied.current) {
      applied.current = cookie;
      setTheme(cookie);
    }
  }, [setTheme]);

  // Au montage : le cookie fait autorité sur le localStorage local
  // (les apps partagent le thème via le domaine parent).
  React.useEffect(() => {
    const cookie = readThemeCookie();
    if (cookie && VALID_THEMES.has(cookie)) {
      applied.current = cookie;
      setTheme(cookie);
    }
  }, [setTheme]);

  // Suivi temps réel : polling + re-sync au focus / retour sur l'onglet.
  React.useEffect(() => {
    const id = window.setInterval(syncFromCookie, THEME_COOKIE_POLL_MS);
    const onFocus = () => syncFromCookie();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncFromCookie();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [syncFromCookie]);

  // Suit le thème local pour ne pas ré-appliquer une valeur déjà active.
  React.useEffect(() => {
    if (resolvedTheme) applied.current = resolvedTheme;
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <CookieWriter />
      <CookieReader />
      {children}
    </NextThemesProvider>
  );
}

export { THEME_COOKIE, readThemeCookie, writeThemeCookie } from './cookie';
