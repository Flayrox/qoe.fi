'use client';

import React, { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { BookOpen, Upload, Trash2, Loader2, ArrowLeft, Lock } from 'lucide-react';
import { deleteEbookAction, type EbookSummary } from '@qoe/sdk';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import {
  describeEbookError,
  describeEbookProgress,
  describeEbookQuota,
  ebookCoverUrl,
  ebookReadUrl,
  isEpubFileName,
  isEbookQuotaReached,
} from './ebooks-helpers';

// =====================================================================
// 📚 Mes livres — import, bibliothèque, suppression (fiche Plus P1)
// =====================================================================
// Quota : 5 gratuits, illimités en Plus. Au refus, on explique et on
// rassure (les livres existants restent) — jamais de vente de vent.
// L'import passe par /api/ebooks/upload (multipart relayé au Go, 20 Mo) ;
// la couverture par /api/ebooks/{id}/cover (relayée, privée).
// =====================================================================

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface EbooksClientProps {
  initialEbooks: EbookSummary[];
  plus: boolean;
}

export function EbooksClient({ initialEbooks, plus }: EbooksClientProps) {
  const [books, setBooks] = useState<EbookSummary[]>(initialEbooks);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingDelete, startDelete] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const quotaReached = isEbookQuotaReached(books.length, plus);

  const onPick = () => inputRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    // Garde-fous immédiats (le serveur re-vérifie tout — ce n'est que du
    // confort : on évite d'envoyer 20 Mo pour rien).
    if (!isEpubFileName(file.name)) {
      setError('Format non reconnu : choisissez un fichier .epub.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Fichier trop volumineux (20 Mo max).');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch('/api/ebooks/upload', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as EbookSummary & {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setError(describeEbookError(body.code, body.error));
        return;
      }
      setBooks((prev) => [body, ...prev]);
      toast.success(`« ${body.title} » importé (${body.chapterCount} chapitres)`);
    } catch {
      setError(describeEbookError(null, null));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDelete = (id: string) => {
    startDelete(async () => {
      const res = await deleteEbookAction({ id });
      if (!res.ok) {
        toast.error(describeEbookError(res.error.code ?? null, res.error.message));
        return;
      }
      setBooks((prev) => prev.filter((b) => b.id !== id));
      setConfirmId(null);
      toast.success('Livre supprimé.');
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/library"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Retour à la bibliothèque"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              Mes livres
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
              {describeEbookQuota(books.length, plus)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Vos EPUBs, strictement personnels — jamais publiés, jamais partagés.
          </p>
        </div>

        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-2xs cursor-pointer disabled:opacity-60 self-start sm:self-auto"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          <span>{uploading ? 'Import en cours…' : 'Importer un EPUB'}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".epub,application/epub+zip"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>

      {/* ─── Quota gratuit atteint : informatif, jamais bloquant pour les
            livres déjà importés ─── */}
      {quotaReached && (
        <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-primary" />
            Quota gratuit atteint (5 livres)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Vos 5 livres restent lisibles et synchronisés. L&apos;abonnement Plus lèvera la limite
            (bientôt disponible) — pas de suppression, jamais.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* ─── Bibliothèque ─── */}
      {books.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Aucun livre pour l&apos;instant</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Importez un EPUB : le texte est extrait et sécurisé (titres, paragraphes, citations), la
            couverture conservée, et votre progression synchronisée entre vos appareils.
          </p>
          <button
            type="button"
            onClick={onPick}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground border border-border/50 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-primary" />
            <span>Importer un EPUB</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {books.map((book) => {
            const progress = describeEbookProgress(book);
            return (
              <div
                key={book.id}
                className="group rounded-2xl border border-border/50 bg-card overflow-hidden flex flex-col"
              >
                <Link
                  href={ebookReadUrl(book.id)}
                  className="relative block aspect-[2/3] bg-muted/40 overflow-hidden"
                >
                  {book.hasCover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ebookCoverUrl(book.id)}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  {progress && (
                    <span
                      className="absolute bottom-0 left-0 h-1 bg-primary"
                      style={{ width: `${book.progressPct}%` }}
                    />
                  )}
                </Link>
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <Link href={ebookReadUrl(book.id)} className="block">
                    <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                      {book.title}
                    </p>
                  </Link>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {book.author || 'Auteur inconnu'} · {book.chapterCount} chapitre
                    {book.chapterCount > 1 ? 's' : ''}
                  </p>
                  {progress && <p className="text-[10px] text-primary font-medium">{progress}</p>}
                  <div className="mt-auto pt-2 flex items-center justify-between">
                    <Link
                      href={ebookReadUrl(book.id)}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      {book.progressPct > 0 ? 'Reprendre' : 'Lire'}
                    </Link>
                    {confirmId === book.id ? (
                      <button
                        type="button"
                        onClick={() => onDelete(book.id)}
                        disabled={pendingDelete}
                        className={cn(
                          'text-[11px] font-semibold px-2 py-0.5 rounded-md',
                          'bg-destructive/10 text-destructive hover:bg-destructive/20 cursor-pointer'
                        )}
                      >
                        Confirmer
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(book.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        title="Supprimer ce livre"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
