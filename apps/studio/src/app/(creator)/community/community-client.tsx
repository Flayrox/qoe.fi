'use client';

// =====================================================================
// 💬 CommunityClient — choisir un article, lire et supprimer
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
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
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(articles.map((article) => [article.id, article.commentsCount]))
  );

  // Seule la dernière demande compte : la réponse tardive d'un article
  // quitté entre-temps ne doit pas écraser la discussion affichée.
  const latestRequest = useRef(0);

  const load = useCallback(async (articleId: string) => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const res = await getArticleCommentsAction({ articleId });
      if (requestId !== latestRequest.current) return;
      if (res.ok) {
        setComments(res.data.items);
        setCursor(res.data.nextCursor);
        setHasMore(res.data.hasMore);
        setCounts((current) => ({
          ...current,
          [articleId]: res.data.items.filter((c) => !c.tombstone).length,
        }));
      } else {
        setError(t`Impossible de charger les commentaires.`);
      }
    } catch {
      if (requestId !== latestRequest.current) return;
      setError(t`Impossible de charger les commentaires.`);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void load(selectedId);
  }, [selectedId, load]);

  // La suite arrive par le même curseur : aucune discussion n'est plus
  // chargée en entier d'un coup (R134).
  const loadMore = useCallback(async () => {
    if (!selectedId || !cursor || loadingMore) return;
    const requestId = latestRequest.current;
    setLoadingMore(true);
    try {
      const res = await getArticleCommentsAction({ articleId: selectedId, cursor });
      if (requestId !== latestRequest.current) return;
      if (res.ok) {
        setComments((current) => [...current, ...res.data.items]);
        setCursor(res.data.nextCursor);
        setHasMore(res.data.hasMore);
      } else {
        setError(t`Impossible de charger la suite.`);
      }
    } catch {
      setError(t`Impossible de charger la suite.`);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, selectedId]);

  const remove = async (commentId: string) => {
    if (!selectedId) return;
    setError(null);
    try {
      const res = await deleteArticleCommentAction(commentId);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      // Le serveur garde la ligne en tombstone : on conserve la place dans la
      // liste et on ne décrémente le compteur que si elle était vivante.
      setComments((current) => {
        const target = current.find((comment) => comment.id === commentId);
        const next = current.map((comment) =>
          comment.id === commentId
            ? { ...comment, content: '', author: null, tombstone: true }
            : comment
        );
        if (target && !target.tombstone) {
          setCounts((map) => ({ ...map, [selectedId]: Math.max((map[selectedId] ?? 1) - 1, 0) }));
        }
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedId(article.id)}
                  className={`flex w-full! justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                    active
                      ? 'bg-muted font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60'
                  } h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! `}
                >
                  <span className="line-clamp-2">{article.title}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
                    <MessageSquare className="h-3! w-3!" />
                    {count}
                  </span>
                </Button>
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
                      {comment.tombstone
                        ? t`Message supprimé`
                        : comment.author?.name || comment.author?.username || t`Lecteur`}
                      {(comment.replyCount ?? 0) > 0 && (
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          {t`${comment.replyCount ?? 0} réponses`}
                        </span>
                      )}
                    </p>
                    {!comment.tombstone && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                        {comment.content}
                      </p>
                    )}
                  </div>
                  {!comment.tombstone && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => void remove(comment.id)}
                      className="shrink-0 gap-1 rounded-lg border border-border px-2 py-1 font-medium! text-muted-foreground transition-colors hover:bg-transparent hover:text-destructive-text h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal "
                    >
                      <Trash2 />
                      {t`Supprimer`}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {hasMore && !loading && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void loadMore()}
            loading={loadingMore}
            className="mt-3 gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium! text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal "
          >
            {t`Afficher plus`}
          </Button>
        )}
      </section>
    </div>
  );
}
