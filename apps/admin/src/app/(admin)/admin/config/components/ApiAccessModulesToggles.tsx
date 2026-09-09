'use client';

// =====================================================================
// 🎛️ Permissions d'accès API — toggles superadmin (SystemConfig
// API_ACCESS_MODULES)
// =====================================================================
// Le registre des permissions accordables aux créateurs est lui-même
// modulable : l'admin active / désactive ici chaque capacité à l'échelle
// de la plateforme (API entrante lecture/écriture/analytics, API sortante
// webhooks, OAuth). Un module désactivé ne peut plus être accordé ni
// utilisé, même si un créateur en possède encore le grant.

import { useState } from 'react';
import { saveApiAccessModulesAction } from '@/lib/admin-aux-actions';
import { cn } from '@qoe/utils';
import { ArrowDownLeft, ArrowUpRight, KeyRound } from 'lucide-react';

export interface ApiAccessModule {
  key: string;
  label: string;
  description: string;
  category: string;
  enabled: boolean;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  api: { label: 'API entrante', icon: <ArrowDownLeft className="w-3.5 h-3.5" /> },
  webhooks: { label: 'API sortante', icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
  oauth: { label: 'OAuth / OIDC', icon: <KeyRound className="w-3.5 h-3.5" /> },
};

export function ApiAccessModulesToggles({ initialModules }: { initialModules: ApiAccessModule[] }) {
  const [modules, setModules] = useState<ApiAccessModule[]>(initialModules);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const enabled = modules.filter((m) => m.enabled).map((m) => m.key);
      const res = await saveApiAccessModulesAction(enabled);
      setMessage(res.success ? 'Modules d’accès API enregistrés.' : (res.error ?? 'Erreur.'));
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = modules.filter((m) => m.enabled).length;
  const categories = [...new Set(modules.map((m) => m.category))];

  return (
    <section className="space-y-5 border-y border-border py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Permissions d’accès API</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Modules accordables aux créateurs lors de l’approbation d’une demande d’accès API (clé{' '}
            <code className="font-mono text-xs">API_ACCESS_MODULES</code>). Désactiver un module
            l’empêche d’être accordé — et d’être utilisé — à l’échelle de la plateforme, sans casser
            les intégrations existantes.
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

      <div className="space-y-5">
        {categories.map((cat) => (
          <div key={cat}>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              {CATEGORY_META[cat]?.icon}
              {CATEGORY_META[cat]?.label ?? cat}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules
                .filter((m) => m.category === cat)
                .map((m) => {
                  const enabled = m.enabled;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      aria-pressed={enabled}
                      onClick={() => {
                        setModules((prev) =>
                          prev.map((p) => (p.key === m.key ? { ...p, enabled: !p.enabled } : p))
                        );
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
                            enabled
                              ? 'bg-success/15 text-success'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {enabled ? 'Activé' : 'Désactivé'}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground leading-snug">
                        {m.description}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {enabledCount} module{enabledCount > 1 ? 's' : ''} accordable
          {enabledCount > 1 ? 's' : ''} sur {modules.length}.
        </span>
        {message && (
          <span
            className={cn(
              'font-medium',
              message.includes('enregistrés') ? 'text-success' : 'text-destructive'
            )}
          >
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
