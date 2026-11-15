'use client';

// =====================================================================
// 💬 CommunityClient — choisir un article, lire et supprimer
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { t } from '@lingui/core/macro';
import {
  deleteArticleCommentAction,
  getArticleCommentsAction,
  type ArticleCommentPayload,
} from '@qoe/sdk/actions/articles';

export interface CommunityArticle {
  id: string;
  title: string;
  commentsCount: number;
}

export function CommunityClient({ articles }: { articles: CommunityArticle[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(
    articles.find((article) => article.commentsCount > 0)?.id ?? articles[0]?.id ?? null
  );
  const [comments, setComments] = useState<ArticleCommentPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(articles.map((article) => [article.id, article.commentsCount]))
  );

  const load = useCallback(async (articleId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getArticleCommentsAction(articleId);
      if (res.ok) {
        setComments(res.data);
        setCounts((current) => ({ ...current, [articleId]: res.data.length }));
      } else {
        setError(t`Impossible de charger les commentaires.`);
      }
    } catch {
      setError(t`Impossible de charger les commentaires.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void load(selectedId);
  }, [selectedId, load]);

  const remove = async (commentId: string) => {
    if (!selectedId) return;
    setError(null);
    try {
      const res = await deleteArticleCommentAction(commentId);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setComments((current) => {
        const next = current.filter((comment) => comment.id !== commentId);
        setCounts((map) => ({ ...map, [selectedId]: next.length }));
        return next;
      });
    } catch {
      setError(t`Suppression impossible.`);
    }
  };

  if (articles.length === 0) {
    return (
      <p className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        {t`Aucun article pour l’instant : la discussion apparaîtra ici dès la première publication.`}
      </p>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav className="rounded-2xl border border-border/60 bg-card p-2">
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
          {articles.map((article) => {
            const count = counts[article.id] ?? 0;
            const active = article.id === selectedId;
            return (
              <li key={article.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(article.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                    active
                      ? 'bg-muted font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <span className="line-clamp-2">{article.title}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
                    <MessageSquare className="h-3 w-3" />
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="rounded-2xl border border-border/60 bg-card p-5">
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-text"
          >
            {error}
          </p>
        )}

        {loading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t`Chargement…`}
          </p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t`Aucun commentaire sur cet article.`}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {comments.map((comment) => (
              <li key={comment.id} className={comment.parentId ? 'py-3 pl-6' : 'py-3'}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      {comment.author?.name || comment.author?.username || t`Lecteur`}
                      {comment.parentId && (
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          {t`réponse`}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                      {comment.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(comment.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-destructive-text"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t`Supprimer`}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
