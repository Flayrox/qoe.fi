'use client';

import { openCookiePreferences } from './cookie-consent-storage';

/** 🍪 Rouvre la bannière de consentement (« Gérer mes cookies »). */
export function CookiePreferencesButton({
  label = 'Gérer mes cookies',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className={
        className ??
        'rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted'
      }
    >
      {label}
    </button>
  );
}
