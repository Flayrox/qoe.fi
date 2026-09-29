'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';
import { setEbookProgressAction, type EbookDetail } from '@qoe/sdk';
import { cn } from '@qoe/utils';
import { clampChapter, clampPct } from '../ebooks-helpers';

// =====================================================================
// 📖 Lecteur EPUB — un chapitre à la fois, progression synchronisée
// =====================================================================
// La progression est poussée au serveur (debounce 900 ms + à la sortie) :
// elle suit le lecteur d'un appareil à l'autre (last-write-wins assumé).
// L'échec d'enregistrement ne bloque JAMAIS la lecture : on le signale
// discrètement et on continue (la lecture est locale, le confort est en
// plus).
// =====================================================================

export function EbookReader({ book }: { book: EbookDetail }) {
  const chapters = book.chapters ?? [];
  const [index, setIndex] = useState(() =>
    clampChapter(book.progressChapter, chapters.length || 1)
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAt = useRef(clampChapter(book.progressChapter, chapters.length || 1));
  const latestIndex = useRef(index);
  latestIndex.current = index;

  const pct = chapters.length > 0 ? clampPct(Math.round(((index + 1) / chapters.length) * 100)) : 0;

  const save = useCallback(
    async (chapter: number) => {
      setState('saving');
      const res = await setEbookProgressAction({ id: book.id, chapter, pct });
      setState(res.ok ? 'saved' : 'error');
    },
    [book.id, pct]
  );

  // Debounce : une lecture feuilletée ne doit pas générer 30 écritures. On
  // n'écrit rien à l'ouverture (le chapitre n'a pas bougé).
  useEffect(() => {
    if (index === openedAt.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(index), 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, save]);

  // Sortie de page (onglet fermé, navigation) : on pousse le dernier
  // chapitre lu — jamais perdu, même sans attendre le debounce.
  useEffect(() => {
    const flush = () => {
      if (latestIndex.current === openedAt.current) return;
      if (timer.current) clearTimeout(timer.current);
      void save(latestIndex.current);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => clampChapter(i + 1, chapters.length));
      if (e.key === 'ArrowLeft') setIndex((i) => clampChapter(i - 1, chapters.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapters.length]);

  const chapter = chapters[index];

  if (!chapter) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-2">
        <p className="text-sm font-semibold">Ce livre ne contient aucun chapitre lisible.</p>
        <Link href="/library/ebooks" className="text-xs font-semibold text-primary hover:underline">
          Retour à mes livres
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ─── Header ─── */}
      <div className="border-b border-border/40 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Link
              href="/library/ebooks"
              className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Retour à mes livres"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-foreground truncate">
                {book.title}
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                {book.author || 'Auteur inconnu'} · chapitre {index + 1}/{chapters.length}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground shrink-0 mt-1 flex items-center gap-1">
            {state === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Enregistrement…
              </>
            )}
            {state === 'saved' && (
              <>
                <Check className="w-3 h-3 text-primary" /> Progression enregistrée
              </>
            )}
            {state === 'error' && (
              <span className="text-destructive">Hors ligne — non enregistré</span>
            )}
          </span>
        </div>
        {/* Barre de progression */}
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* ─── Chapitre : HTML strict du parseur (sûr par construction) ─── */}
      <article
        className="prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed text-foreground/90 antialiased"
        dangerouslySetInnerHTML={{ __html: chapter.html }}
      />

      {/* ─── Navigation ─── */}
      <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-4">
        <button
          type="button"
          onClick={() => setIndex((i) => clampChapter(i - 1, chapters.length))}
          disabled={index === 0}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl',
            'bg-muted/60 hover:bg-muted text-foreground border border-border/50 transition-colors cursor-pointer',
            'disabled:opacity-40 disabled:cursor-default'
          )}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Précédent</span>
        </button>

        <select
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="text-xs bg-muted/50 border border-border/50 rounded-xl px-2 py-1.5 max-w-[50%] truncate cursor-pointer"
          aria-label="Choisir un chapitre"
        >
          {chapters.map((c, i) => (
            <option key={i} value={i}>
              {i + 1}. {c.title || `Chapitre ${i + 1}`}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setIndex((i) => clampChapter(i + 1, chapters.length))}
          disabled={index >= chapters.length - 1}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl',
            'bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer',
            'disabled:opacity-40 disabled:cursor-default'
          )}
        >
          <span>Suivant</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
