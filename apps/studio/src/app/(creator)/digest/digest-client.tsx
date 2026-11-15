'use client';

// =====================================================================
// 📬 DigestClient — fréquence, contenu, aperçu
// =====================================================================

import { useState, useTransition } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { t } from '@lingui/core/macro';

import { previewDigestAction, saveDigestAction, type DigestConfig } from './actions';

const WEEKDAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
];

export function DigestClient({ initialConfig }: { initialConfig: DigestConfig }) {
  const [config, setConfig] = useState<DigestConfig>(initialConfig);
  const [saved, setSaved] = useState<DigestConfig>(initialConfig);
  const [preview, setPreview] = useState<{ subject: string; html: string; count: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = <K extends keyof DigestConfig>(key: K, value: DigestConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await saveDigestAction(config);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setConfig(res.config);
      setSaved(res.config);
      setNotice(t`Réglages enregistrés.`);
    });
  };

  const runPreview = () => {
    setError(null);
    startTransition(async () => {
      const res = await previewDigestAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setPreview(res.preview);
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="h-fit rounded-2xl border border-border/60 bg-card p-5">
        <label className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mail className="h-4 w-4 text-muted-foreground" />
            {t`Digest hebdomadaire`}
          </span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => update('enabled', event.target.checked)}
            className="h-4 w-4"
          />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t`Un seul email par semaine, avec les derniers articles publiés. Désactivé par défaut.`}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-foreground">
            {t`Jour`}
            <select
              value={config.weekday}
              onChange={(event) => update('weekday', Number(event.target.value))}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {WEEKDAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-foreground">
            {t`Heure`}
            <input
              type="number"
              min={0}
              max={23}
              value={config.hour}
              onChange={(event) => update('hour', Number(event.target.value))}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="col-span-2 text-xs font-medium text-foreground">
            {t`Nombre d’articles (1 à 12)`}
            <input
              type="number"
              min={1}
              max={12}
              value={config.maxArticles}
              onChange={(event) => update('maxArticles', Number(event.target.value))}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="col-span-2 text-xs font-medium text-foreground">
            {t`Introduction (optionnel)`}
            <textarea
              value={config.intro}
              onChange={(event) => update('intro', event.target.value)}
              rows={3}
              placeholder={t`Cette semaine dans la publication…`}
              className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-text"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-xl border border-success/20 bg-success/10 p-3 text-xs text-success-text">
            {notice}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : t`Enregistrer`}
          </button>
          <button
            type="button"
            onClick={runPreview}
            disabled={isPending}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {t`Voir l’aperçu`}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {config.enabled ? t`Actif` : t`Inactif`}
          {saved.enabled !== config.enabled && ` · ${t`modifications non enregistrées`}`}
        </p>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t`Aperçu du prochain envoi`}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {preview
            ? `${preview.count} ${t`article(s) sélectionné(s)`}`
            : t`Cliquez sur « Voir l’aperçu » pour générer le rendu réel.`}
        </p>
        {preview && (
          <>
            <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-foreground">
              {preview.subject}
            </p>
            <iframe
              title={t`Aperçu du digest`}
              srcDoc={preview.html}
              sandbox=""
              className="mt-3 h-[520px] w-full rounded-xl border border-border/60 bg-white"
            />
          </>
        )}
      </section>
    </div>
  );
}
