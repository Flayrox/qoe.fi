'use client';

// =====================================================================
// 📚 BooksClient — sélection d'articles, titre, téléchargement EPUB
// =====================================================================

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { t } from '@lingui/core/macro';

export interface BookArticle {
  id: string;
  title: string;
  createdAt: string | null;
}

export function BooksClient({ articles }: { articles: BookArticle[] }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const compile = async () => {
    setError(null);
    if (!title.trim()) {
      setError(t`Donnez un titre à votre livre.`);
      return;
    }
    if (selected.length === 0) {
      setError(t`Sélectionnez au moins un article.`);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/books/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), author: author.trim(), articleIds: selected }),
      });
      if (!response.ok) {
        setError(t`Compilation impossible pour le moment.`);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${title.trim().replace(/\s+/g, '-').toLowerCase() || 'livre'}.epub`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t`Compilation impossible pour le moment.`);
    } finally {
      setLoading(false);
    }
  };

  if (articles.length === 0) {
    return (
      <p className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        {t`Publiez d’abord un article : il deviendra un chapitre.`}
      </p>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t`Chapitres`}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t`L’ordre de sélection fait l’ordre du livre.`}
        </p>
        <ul className="mt-3 max-h-[60vh] divide-y divide-border/40 overflow-y-auto">
          {articles.map((article) => {
            const order = selected.indexOf(article.id);
            return (
              <li key={article.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={order >= 0}
                    onChange={() => toggle(article.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {article.title}
                  </span>
                  {order >= 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {order + 1}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="h-fit rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t`Le livre`}</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-foreground">
            {t`Titre`}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t`Recueil 2026`}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-foreground">
            {t`Auteur (optionnel)`}
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder={t`Votre nom de publication`}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-text"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void compile()}
          disabled={loading}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {loading ? t`Compilation…` : t`Télécharger l’EPUB`}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {selected.length} {t`chapitre(s) sélectionné(s)`}
        </p>
      </aside>
    </div>
  );
}
