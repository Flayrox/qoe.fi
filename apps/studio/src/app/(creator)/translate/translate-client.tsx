'use client';

// =====================================================================
// 🌍 TranslateClient — choisir un article, traduire, relire, copier
// =====================================================================

import { useEffect, useRef, useState, useTransition } from 'react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { Callout } from '@qoe/ui/callout';
import { Icon } from '@qoe/ui/icons';
import { Select } from '@qoe/ui/select';

import { translateArticleAction } from './actions';

export interface TranslatableArticle {
  id: string;
  title: string;
  content: string;
}

const LANGUAGES = () => [
  { code: 'en', label: 'Anglais' },
  { code: 'fr', label: t`Français` },
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
  // Un seul minuteur d'indicateur à la fois : sans annulation, la deuxième
  // copie perdait son « Copié » au terme du délai de la première.
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

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
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      // Presse-papiers refusé (permission, contexte non sécurisé) : le dire
      // plutôt que laisser une promesse rejetée sans retour visuel.
      setCopied(false);
      setError(t`Erreur lors de la copie`);
      return;
    }
    setError(null);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
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
          <Select
            label={t`Article`}
            size="sm"
            value={selectedId}
            onValueChange={(value) => {
              setSelectedId(value);
              setResult(null);
            }}
            options={articles.map((article) => ({ id: article.id, label: article.title }))}
          />

          <Select
            label={t`Langue cible`}
            size="sm"
            value={target}
            onValueChange={setTarget}
            options={LANGUAGES().map((language) => ({
              id: language.code,
              label: language.label,
            }))}
          />

          <Button
            variant="solid"
            tone="neutral"
            size="sm"
            loading={isPending}
            disabled={!selected}
            onClick={run}
          >
            {isPending ? t`Traduction…` : t`Traduire`}
          </Button>
        </div>

        {error && (
          <Callout tone="danger" live className="mt-4">
            {error}
          </Callout>
        )}
      </section>

      {result && (
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{t`Traduction`}</h2>
            <Button variant="outline" size="xs" onClick={() => void copy()}>
              <Icon name={copied ? 'check' : 'copy'} size="sm" />
              {copied ? t`Copié` : t`Copier`}
            </Button>
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
