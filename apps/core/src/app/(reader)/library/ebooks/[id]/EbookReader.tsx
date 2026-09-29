'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Search,
  StickyNote,
  X,
} from 'lucide-react';
import { setEbookProgressAction, type EbookDetail, type EbookNote } from '@qoe/sdk';
import { cn } from '@qoe/utils';
import { clampChapter, clampPct } from '../ebooks-helpers';
import { searchEbookChapters, type EbookSearchHit } from '../ebook-search';
import { EbookNotes } from './EbookNotes';

// =====================================================================
// 📖 Lecteur EPUB — un chapitre à la fois, progression synchronisée
// =====================================================================
// La progression est poussée au serveur (debounce 900 ms + à la sortie) :
// elle suit le lecteur d'un appareil à l'autre (last-write-wins assumé).
// L'échec d'enregistrement ne bloque JAMAIS la lecture : on le signale
// discrètement et on continue (la lecture est locale, le confort est en
// plus).
// =====================================================================

// Occurrence surlignée dans un extrait de recherche (jamais de HTML : le
// texte est rendu en JSX, la requête ne peut donc pas injecter de balise).
function Snippet({ hit }: { hit: EbookSearchHit }) {
  const before = hit.snippet.slice(0, hit.matchStart);
  const match = hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength);
  const after = hit.snippet.slice(hit.matchStart + hit.matchLength);
  return (
    <span className="text-[11px] text-muted-foreground leading-snug">
      {before}
      <mark className="bg-primary/20 text-foreground rounded px-0.5">{match}</mark>
      {after}
    </span>
  );
}

export function EbookReader({
  book,
  initialNotes = [],
}: {
  book: EbookDetail;
  initialNotes?: EbookNote[];
}) {
  const chapters = book.chapters ?? [];
  const [index, setIndex] = useState(() =>
    clampChapter(book.progressChapter, chapters.length || 1)
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<EbookNote[]>(initialNotes);
  const [notesOpen, setNotesOpen] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [draftExcerpt, setDraftExcerpt] = useState<string | null>(null);
  // Les chapitres sont déjà dans le client : la recherche est locale (aucun
  // aller-retour par frappe) et bornée (40 extraits max).
  const hits = useMemo(() => searchEbookChapters(chapters, query), [chapters, query]);
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
  const chapterNotes = notes.filter((n) => n.chapterIndex === index);

  // Sélection de texte → on propose de la garder (jamais d'action imposée :
  // le bouton est flottant, la sélection reste utilisable normalement).
  const captureSelection = () => {
    const text = window.getSelection()?.toString().trim() ?? '';
    setSelection(text.length >= 2 ? text.slice(0, 500) : null);
  };

  const keepNotesSorted = (list: EbookNote[]) =>
    [...list].sort(
      (a, b) => a.chapterIndex - b.chapterIndex || a.createdAt.localeCompare(b.createdAt)
    );

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
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
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
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1 transition-colors cursor-pointer',
                notesOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Mes notes sur ce chapitre"
            >
              <StickyNote className="w-4 h-4" />
              {chapterNotes.length > 0 && (
                <span className="text-[10px] font-semibold">{chapterNotes.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen((v) => !v);
                setQuery('');
              }}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Rechercher dans ce livre"
            >
              {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {/* Recherche dans le livre (locale, instantanée) */}
        {searchOpen && (
          <div className="space-y-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans ce livre…"
              className="w-full text-xs px-3 py-2 rounded-xl bg-muted/50 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {query.trim().length >= 2 && (
              <div className="rounded-xl border border-border/50 bg-card max-h-64 overflow-y-auto divide-y divide-border/40">
                {hits.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-3">
                    Aucun résultat dans ce livre.
                  </p>
                ) : (
                  hits.map((hit, i) => (
                    <button
                      key={`${hit.chapterIndex}-${i}`}
                      type="button"
                      onClick={() => setIndex(hit.chapterIndex)}
                      className={cn(
                        'w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors cursor-pointer',
                        hit.chapterIndex === index && 'bg-muted/30'
                      )}
                    >
                      <span className="block text-[10px] font-semibold text-primary mb-0.5">
                        {hit.chapterTitle}
                      </span>
                      <Snippet hit={hit} />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Barre de progression */}
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* ─── Notes du chapitre (table dédiée, privée) ─── */}
      {notesOpen && (
        <EbookNotes
          ebookId={book.id}
          chapterIndex={index}
          chapterTitle={chapter.title || `Chapitre ${index + 1}`}
          notes={chapterNotes}
          totalCount={notes.length}
          onAdd={(n) => setNotes((prev) => keepNotesSorted([...prev, n]))}
          onUpdate={(n) =>
            setNotes((prev) => keepNotesSorted(prev.map((x) => (x.id === n.id ? n : x))))
          }
          onDelete={(id) => setNotes((prev) => prev.filter((x) => x.id !== id))}
          draftExcerpt={draftExcerpt}
          onDraftConsumed={() => setDraftExcerpt(null)}
        />
      )}

      {/* ─── Chapitre : HTML strict du parseur (sûr par construction) ─── */}
      <div onMouseUp={captureSelection}>
        <article
          className="prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed text-foreground/90 antialiased"
          dangerouslySetInnerHTML={{ __html: chapter.html }}
        />
      </div>

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

      {/* ─── Passage sélectionné : on propose de le garder (aucune action
            imposée, la sélection reste utilisable normalement) ─── */}
      {selection && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[calc(100%-2rem)]">
          <div className="rounded-2xl border border-border/60 bg-card shadow-lg px-3 py-2 flex items-center gap-3">
            <p className="text-[11px] italic text-muted-foreground line-clamp-2 flex-1">
              « {selection} »
            </p>
            <button
              type="button"
              onClick={() => {
                setDraftExcerpt(selection);
                setNotesOpen(true);
                setSelection(null);
              }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer shrink-0"
            >
              <StickyNote className="w-3.5 h-3.5" />
              <span>Noter ce passage</span>
            </button>
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              title="Ignorer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
