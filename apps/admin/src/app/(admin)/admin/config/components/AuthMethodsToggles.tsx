'use client';

// =====================================================================
// 🔐 Méthodes de connexion — toggles superadmin (SystemConfig AUTH_METHODS)
// =====================================================================
// Google/Apple sont en phase de test : le superadmin active/désactive ici
// chaque méthode (boutons OAuth + email/mot de passe + lien magique).
// Le formulaire de login (LoginFormBento) lit la même clé JSON pour ne
// montrer que ce qui est activé.

import { useState } from 'react';
import { saveAuthMethodsAction } from '@/lib/admin-aux-actions';
import { cn } from '@qoe/utils';

export interface AuthMethodsState {
  google: boolean;
  apple: boolean;
  password: boolean;
  magicLink: boolean;
}

const METHODS: { key: keyof AuthMethodsState; label: string; hint: string }[] = [
  { key: 'google', label: 'Google', hint: 'OAuth Google (GoTrue)' },
  { key: 'apple', label: 'Apple', hint: 'OAuth Apple (GoTrue)' },
  {
    key: 'password',
    label: 'Mot de passe',
    hint: 'Email + mot de passe (inclut l’inscription)',
  },
  { key: 'magicLink', label: 'Lien magique', hint: 'Email OTP sans mot de passe' },
];

function parseMethods(raw?: string): AuthMethodsState {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<AuthMethodsState>) : {};
    return {
      google: p.google !== false,
      apple: p.apple !== false,
      password: p.password !== false,
      magicLink: p.magicLink !== false,
    };
  } catch {
    return { google: true, apple: true, password: true, magicLink: true };
  }
}

export function AuthMethodsToggles({ initialValue }: { initialValue?: string }) {
  const [methods, setMethods] = useState<AuthMethodsState>(() => parseMethods(initialValue));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveAuthMethodsAction(methods);
      setMessage(res.success ? 'Méthodes de connexion enregistrées.' : (res.error ?? 'Erreur.'));
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = Object.values(methods).filter(Boolean).length;

  return (
    <section className="space-y-5 border-y border-border py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Méthodes de connexion</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Active / désactive chaque méthode du formulaire de login (clé{' '}
            <code className="font-mono text-xs">AUTH_METHODS</code>). Google est en phase de test :
            coupez-le ici tant qu'il n'est pas opérationnel.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-border disabled:opacity-50"
        >
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METHODS.map((m) => {
          const enabled = methods[m.key];
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={enabled}
              onClick={() => {
                setMethods((prev) => ({ ...prev, [m.key]: !prev[m.key] }));
                setMessage(null);
              }}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors cursor-pointer',
                enabled
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-transparent opacity-60 hover:opacity-100'
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold">{m.label}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                    enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {enabled ? 'Activé' : 'Désactivé'}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{m.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {enabledCount} méthode{enabledCount > 1 ? 's' : ''} active
          {enabledCount > 1 ? 's' : ''} — laissez toujours au moins une méthode de connexion.
        </span>
        {message && (
          <span
            className={cn(
              'font-medium',
              message.includes('enregistrées') ? 'text-success' : 'text-destructive'
            )}
          >
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
