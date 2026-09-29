'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, NotebookPen, Search } from 'lucide-react';
import type { EbookNoteRef } from '@qoe/sdk';
import { toast } from '@qoe/ui/toast';
import { normalizeForSearch } from '../ebook-search';
import { ebookReadUrl } from '../ebooks-helpers';
import { notesToMarkdown } from './notes-markdown';

// =====================================================================
// 🗂️ Toutes mes notes — recherche instantanée + export Markdown
// =====================================================================
// Le filtrage est LOCAL (la liste est déjà là) et suit exactement la même
// règle que la recherche dans un livre : insensible à la casse ET aux
// accents. Cliquer une note ouvre le livre au bon chapitre.
// =====================================================================

export function AllNotesClient({
  initialNotes,
  truncated,
}: {
  initialNotes: EbookNoteRef[];
  truncated: boolean;
}) {
  const [query, setQuery] = useState('');

  const notes = useMemo(() => {
    const needle = normalizeForSearch(query.trim());
    if (!needle) return initialNotes;
    return initialNotes.filter((n) =>
      normalizeForSearch(
        [n.excerpt, n.note, n.chapterTitle, n.ebookTitle, n.ebookAuthor].join('\n')
      ).includes(needle)
    );
  }, [initialNotes, query]);

  const books = useMemo(() => new Set(notes.map((n) => n.ebookId)).size, [notes]);

  const exportMarkdown = () => {
    const md = notesToMarkdown(
      notes.map((n) => ({
        id: n.id,
        ebookId: n.ebookId,
        ebookTitle: n.ebookTitle,
        ebookAuthor: n.ebookAuthor,
        chapterIndex: n.chapterIndex,
        chapterTitle: n.chapterTitle,
        excerpt: n.excerpt,
        note: n.note,
        createdAt: n.createdAt,
      }))
    );
    if (!md) {
      toast.error('Aucune note à exporter.');
      return;
    }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qoe-notes-livres-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Notes exportées en Markdown (.md)');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/library/ebooks"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Retour à mes livres"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              Mes notes de lecture
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
              {notes.length}
              {query.trim() ? ` / ${initialNotes.length}` : ''}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tous vos livres confondus — {books} livre{books > 1 ? 's' : ''}, privé et jamais
            partagé.
            {truncated && ' Liste bornée à 500 notes : les plus anciennes ne sont pas affichées.'}
          </p>
        </div>
        <button
          type="button"
          onClick={exportMarkdown}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground border border-border/50 transition-colors shadow-2xs cursor-pointer self-start sm:self-auto"
          title="Exporter au format Markdown (Notion, Obsidian)"
        >
          <Download className="w-3.5 h-3.5 text-primary" />
          <span>Exporter (.md)</span>
        </button>
      </div>

      {/* ─── Recherche locale ─── */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher dans mes notes (passage, note, livre, auteur)…"
          className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-muted/50 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* ─── Notes ─── */}
      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-14 text-center space-y-2">
          <NotebookPen className="w-7 h-7 mx-auto text-muted-foreground" />
          <p className="text-sm font-semibold">
            {initialNotes.length === 0 ? 'Aucune note pour l’instant' : 'Aucun résultat'}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {initialNotes.length === 0
              ? 'Sélectionnez un passage dans un de vos livres, ou écrivez quelques mots — tout se retrouvera ici.'
              : 'Essayez un autre mot : la recherche ignore la casse et les accents.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-2xl border border-border/50 bg-card px-4 py-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`${ebookReadUrl(note.ebookId)}?chapter=${note.chapterIndex}`}
                  className="text-[10px] font-semibold text-primary hover:underline truncate"
                >
                  {note.ebookTitle} · {note.chapterTitle || `Chapitre ${note.chapterIndex + 1}`}
                </Link>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(note.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
              {note.excerpt && (
                <p className="text-xs italic text-muted-foreground">« {note.excerpt} »</p>
              )}
              {note.note && <p className="text-xs whitespace-pre-wrap">{note.note}</p>}
              {!note.note && (
                <p className="text-[11px] text-muted-foreground">Passage gardé sans commentaire.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
