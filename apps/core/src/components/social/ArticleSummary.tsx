'use client';

import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { summarizeArticleAction } from '@qoe/sdk';
import { useFlag } from '@qoe/flags';
import { Button } from '@qoe/ui/button';

// =====================================================================
// ✨ Résumé IA d'article (fiche Plus P1)
// =====================================================================
// Replié par défaut (un bouton discret, pas un encart imposé). Au clic :
// résumé fidèle servi par le backend (coupé au paywall comme la lecture),
// TOUJOURS présenté comme IA avec renvoi au texte (« Lire l'article
// ci-dessous » — jamais confondu avec l'éditorial, fiche).
// États : quota restant affiché quand connu, 403 Plus → message honnête,
// 429 quota → mois prochain, 503 → indisponible (pas de faux contenu).
// =====================================================================

export function ArticleSummary({ articleId }: { articleId: string }) {
  const isAiEnabled = useFlag('reader-ai-summary');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ remaining: number; limit: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (loading) return;
    if (summary) {
      setOpen((v) => !v);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await summarizeArticleAction({ articleId });
      if (res.ok) {
        setSummary(res.data.summary);
        setUsage({ remaining: res.data.usage.remaining, limit: res.data.usage.limit });
      } else {
        const code = (res.error as { code?: string } | undefined)?.code;
        if (code === 'AI_PLUS_REQUIRED') {
          setError('Résumé IA réservé aux abonnés Plus (bientôt).');
        } else if (code === 'AI_QUOTA_EXCEEDED') {
          setError('Quota IA du mois épuisé — il revient le mois prochain.');
        } else if (code === 'AI_DISABLED') {
          setError("L'assistant IA de lecture est momentanément désactivé.");
        } else if (code === 'AI_UNAVAILABLE') {
          setError('IA momentanément indisponible — réessayez plus tard.');
        } else if (code === 'AI_BUSY') {
          setError('Trop de demandes en ce moment — réessayez dans quelques minutes.');
        } else {
          setError(typeof res.error === 'string' ? res.error : 'Résumé impossible pour le moment.');
        }
      }
    } catch {
      setError('Résumé impossible pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAiEnabled) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
      {/* Le `-ml-2` annule le padding du ghost : le libellé reste aligné
          sur le bord du bloc parent. La densité, le rayon et l'anneau de
          focus viennent du contrat, plus de ce fichier. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void run()}
        disabled={loading}
        className="-ml-2"
      >
        {loading ? (
          <Loader2 className="animate-spin text-primary" />
        ) : (
          <Sparkles className="text-primary" />
        )}
        <span>
          {summary ? (open ? 'Masquer le résumé' : 'Voir le résumé') : 'Résumer cet article'}
        </span>
        {usage && (
          <span className="type-control-xs font-normal text-muted-foreground">
            ({usage.remaining}/{usage.limit} ce mois-ci)
          </span>
        )}
      </Button>
      {open && !loading && summary && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Résumé IA — lire l&apos;article ci-dessous
          </p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">{summary}</p>
        </div>
      )}
      {open && !loading && error && <p className="text-xs text-muted-foreground mt-2">{error}</p>}
    </div>
  );
}
