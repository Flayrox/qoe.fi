'use client';

// =====================================================================
// 🌍 TranslateClient — choisir un article, traduire, relire, copier
// =====================================================================

import { useState, useTransition } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { t } from '@lingui/core/macro';

import { translateArticleAction } from './actions';

export interface TranslatableArticle {
  id: string;
  title: string;
  content: string;
}

const LANGUAGES = [
  { code: 'en', label: 'Anglais' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' },
  { code: 'pt', label: 'Portugais' },
];

export function TranslateClient({ articles }: { articles: TranslatableArticle[] }) {
  const [selectedId, setSelectedId] = useState(articles[0]?.id ?? '');
  const [target, setTarget] = useState('en');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = articles.find((article) => article.id === selectedId);

  const run = () => {
    if (!selected) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await translateArticleAction({ text: selected.content, target });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResult(res.text);
    });
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (articles.length === 0) {
    return (
      <p className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        {t`Aucun article à traduire pour l’instant.`}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
          <label className="text-xs font-medium text-foreground">
            {t`Article`}
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setResult(null);
              }}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {articles.map((article) => (
                <option key={article.id} value={article.id}>
                  {article.title}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-foreground">
            {t`Langue cible`}
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={run}
            disabled={isPending || !selected}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending ? t`Traduction…` : t`Traduire`}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-text"
          >
            {error}
          </p>
        )}
      </section>

      {result && (
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{t`Traduction`}</h2>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
              {copied ? t`Copié` : t`Copier`}
            </button>
          </div>
          <div className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
            {result}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t`Traduction générée par IA : relisez-la avant publication. Les versions localisées publiées arrivent au prochain lot.`}
          </p>
        </section>
      )}
    </div>
  );
}
