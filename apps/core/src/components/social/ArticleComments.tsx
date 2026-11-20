'use client';

// =====================================================================
// 💬 ArticleComments — discussion d'un article (cœur du produit)
// =====================================================================
// Le backend Go gérait déjà les commentaires (liste, création, suppression,
// paliers de confiance) mais seul apps/tenants les affichait. Ici : le même
// contrat, dans le lecteur principal. Réponses sur un niveau, suppression
// réservée à l'auteur du commentaire (le serveur tranche aussi).
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { SafeAvatar } from '@qoe/ui';
import {
  deleteArticleCommentAction,
  getArticleCommentsAction,
  postArticleCommentAction,
  type ArticleCommentPayload,
} from '@qoe/sdk/actions/articles';

interface ArticleCommentsProps {
  articleId: string;
  currentUserId?: string | null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function ArticleComments({ articleId, currentUserId = null }: ArticleCommentsProps) {
  const [comments, setComments] = useState<ArticleCommentPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  // La discussion appartient à SON article : changer d'article efface la liste
  // et une réponse qui arrive en retard est ignorée, sinon les commentaires du
  // précédent se peignaient sous le suivant (même course que F274).
  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getArticleCommentsAction(articleId);
        if (cancelled) return;
        if (res.ok) {
          setComments(res.data);
          setError(null);
        } else {
          setError(t`Impossible de charger les commentaires.`);
        }
      } catch {
        if (!cancelled) setError(t`Impossible de charger les commentaires.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const roots = useMemo(() => comments.filter((comment) => !comment.parentId), [comments]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ArticleCommentPayload[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      const list = map.get(comment.parentId) ?? [];
      list.push(comment);
      map.set(comment.parentId, list);
    }
    return map;
  }, [comments]);

  const submit = async (parentId: string | null) => {
    const text = (parentId ? replyContent : content).trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await postArticleCommentAction({ articleId, content: text, parentId });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setComments((current) => [...current, res.data]);
      if (parentId) {
        setReplyTo(null);
        setReplyContent('');
      } else {
        setContent('');
      }
    } catch {
      setError(t`Publication impossible.`);
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId: string) => {
    setError(null);
    try {
      const res = await deleteArticleCommentAction(commentId);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      // Supprimer une racine supprime ses réponses : sans elles, des réponses
      // orphelines restaient comptées dans l'en-tête sans jamais être rendues.
      setComments((current) =>
        current.filter((comment) => comment.id !== commentId && comment.parentId !== commentId)
      );
    } catch {
      setError(t`Suppression impossible.`);
    }
  };

  const renderComment = (comment: ArticleCommentPayload, isReply = false) => {
    const authorName = comment.author?.name || comment.author?.username || t`Lecteur`;
    const canDelete = Boolean(currentUserId && comment.author?.id === currentUserId);
    return (
      <div
        key={comment.id}
        className={
          isReply
            ? 'ml-10 mt-3 border-l border-border/40 pl-4'
            : 'mt-4 border-t border-border/30 pt-4'
        }
      >
        <div className="flex items-start gap-3">
          <SafeAvatar
            src={comment.author?.logoUrl ?? null}
            name={authorName}
            username={comment.author?.username ?? null}
            size={28}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-semibold text-foreground">{authorName}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatDate(comment.createdAt)}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {comment.content}
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
              {!isReply && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(replyTo === comment.id ? null : comment.id);
                    setReplyContent('');
                  }}
                  className="font-medium hover:text-foreground transition-colors"
                >
                  {t`Répondre`}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void remove(comment.id)}
                  className="inline-flex items-center gap-1 hover:text-destructive-text transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  {t`Supprimer`}
                </button>
              )}
            </div>

            {replyTo === comment.id && (
              <div className="mt-3 flex items-start gap-2">
                <textarea
                  value={replyContent}
                  onChange={(event) => setReplyContent(event.target.value)}
                  rows={2}
                  placeholder={t`Votre réponse…`}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void submit(comment.id)}
                  disabled={sending || !replyContent.trim()}
                  className="rounded-xl bg-foreground px-3 py-2 text-[11px] font-semibold text-background disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t`Envoyer`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section id="comments" className="not-prose mt-12 border-t border-border/40 pt-8">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        {t`Discussion`}
        {comments.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({comments.length})</span>
        )}
      </h2>

      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive-text">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t`Chargement des commentaires…`}
        </p>
      ) : (
        <>
          {roots.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t`Aucun commentaire pour l’instant. Ouvrez la discussion.`}
            </p>
          )}
          <div className="mt-2">
            {roots.map((root) => (
              <div key={root.id}>
                {renderComment(root)}
                <div>
                  {repliesByParent.get(root.id)?.map((reply) => renderComment(reply, true))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {currentUserId ? (
        <div className="mt-6 flex items-start gap-2">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            placeholder={t`Ajouter un commentaire…`}
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void submit(null)}
            disabled={sending || !content.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {t`Envoyer`}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {t`Connectez-vous pour participer à la discussion.`}
        </p>
      )}
    </section>
  );
}
