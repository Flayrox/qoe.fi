'use client';

// =====================================================================
// 💬 ArticleComments — discussion imbriquée d'un article (cœur du produit)
// =====================================================================
// Le commentaire est un post (L41) : le fil est donc un arbre sans limite de
// profondeur, paginé par curseur stable (createdAt, id) à chaque niveau (L42).
// Rien n'est plus chargé « en entier » : la page d'un article charge les
// commentaires de niveau 1, chaque nœud charge ses réponses à l'ouverture.
//
// Un commentaire supprimé devient un tombstone : sa place et son compteur
// restent, ni le contenu ni l'auteur ne sortent, et ses réponses restent
// atteignables (la structure du fil ne s'effondre pas).
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { SafeAvatar } from '@qoe/ui';
import {
  deleteArticleCommentAction,
  getArticleCommentsAction,
  getPostRepliesAction,
  postArticleCommentAction,
  type ArticleCommentPayload,
} from '@qoe/sdk/actions/articles';

interface ArticleCommentsProps {
  articleId: string;
  currentUserId?: string | null;
}

const PAGE_SIZE = 20;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Remplace un commentaire par son tombstone, sans toucher au fil. */
function asTombstone(comment: ArticleCommentPayload): ArticleCommentPayload {
  return { ...comment, content: '', author: null, tombstone: true, likeCount: 0, repostCount: 0 };
}

function tombstoneOf(comment: ArticleCommentPayload): ArticleCommentPayload {
  return asTombstone(comment);
}

export function ArticleComments({ articleId, currentUserId = null }: ArticleCommentsProps) {
  const [roots, setRoots] = useState<ArticleCommentPayload[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La discussion appartient à SON article : changer d'article efface le fil
  // et une réponse tardive est ignorée (même course que F274).
  useEffect(() => {
    let cancelled = false;
    setRoots([]);
    setCursor('');
    setHasMore(false);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getArticleCommentsAction({ articleId, limit: PAGE_SIZE });
        if (cancelled) return;
        if (res.ok) {
          setRoots(res.data.items);
          setCursor(res.data.nextCursor);
          setHasMore(res.data.hasMore);
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

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await getArticleCommentsAction({ articleId, cursor, limit: PAGE_SIZE });
      if (res.ok) {
        setRoots((current) => [...current, ...res.data.items]);
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
  }, [articleId, cursor, loadingMore]);

  const submitRoot = async () => {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await postArticleCommentAction({ articleId, content: text, parentId: null });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setRoots((current) => [...current, res.data]);
      setContent('');
    } catch {
      setError(t`Publication impossible.`);
    } finally {
      setSending(false);
    }
  };

  const tombstoneRoot = (commentId: string) =>
    setRoots((current) => current.map((c) => (c.id === commentId ? asTombstone(c) : c)));

  const totalLoaded = roots.length;

  return (
    <section id="comments" className="not-prose mt-12 border-t border-border/40 pt-8">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        {t`Discussion`}
        {totalLoaded > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({totalLoaded})</span>
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
              <CommentNode
                key={root.id}
                comment={root}
                articleId={articleId}
                currentUserId={currentUserId}
                depth={0}
                onTombstone={tombstoneRoot}
              />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t`Afficher plus de commentaires`}
            </button>
          )}
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
            onClick={() => void submitRoot()}
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

interface CommentNodeProps {
  comment: ArticleCommentPayload;
  articleId: string;
  currentUserId: string | null;
  depth: number;
  onTombstone: (commentId: string) => void;
}

// CommentNode rend un niveau du fil et ne charge ses réponses qu'à
// l'ouverture : un article très commenté n'envoie jamais tout l'arbre.
function CommentNode({ comment, articleId, currentUserId, depth, onTombstone }: CommentNodeProps) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<ArticleCommentPayload[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const replyCount = comment.replyCount ?? 0;
  const isTombstone = Boolean(comment.tombstone);
  const indent = depth === 0 ? '' : 'ml-6 border-l border-border/40 pl-4';

  const loadReplies = useCallback(
    async (next: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getPostRepliesAction({
          postId: comment.id,
          cursor: next,
          limit: PAGE_SIZE,
        });
        if (res.ok) {
          setReplies((current) => (next ? [...current, ...res.data.items] : res.data.items));
          setCursor(res.data.nextCursor);
          setHasMore(res.data.hasMore);
          setLoaded(true);
        } else {
          setError(t`Impossible de charger les réponses.`);
        }
      } catch {
        setError(t`Impossible de charger les réponses.`);
      } finally {
        setLoading(false);
      }
    },
    [comment.id]
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void loadReplies('');
  };

  const submitReply = async () => {
    const text = replyContent.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await postArticleCommentAction({
        articleId,
        content: text,
        parentId: comment.id,
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      // La réponse arrive après les autres (ordre createdAt) : on l'ajoute en
      // fin de page, puis on laisse le compteur local suivre.
      setReplies((current) => [...current, res.data]);
      setReplying(false);
      setReplyContent('');
      setOpen(true);
      setLoaded(true);
    } catch {
      setError(t`Publication impossible.`);
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      const res = await deleteArticleCommentAction(comment.id);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      // Le serveur transforme la ligne en tombstone : on garde la place et on
      // laisse `replyCount` décrire les réponses vivantes.
      if (depth === 0) onTombstone(comment.id);
      else setReplies((current) => current.map((r) => (r.id === comment.id ? tombstoneOf(r) : r)));
      setReplying(false);
    } catch {
      setError(t`Suppression impossible.`);
    }
  };

  const authorName = comment.author?.name || comment.author?.username || t`Lecteur`;
  const canDelete = Boolean(currentUserId && comment.author?.id === currentUserId);

  return (
    <div className={`${indent} mt-3`}>
      <div className="flex items-start gap-3">
        {isTombstone ? (
          <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-dashed border-border/60" />
        ) : (
          <SafeAvatar
            src={comment.author?.logoUrl ?? null}
            name={authorName}
            username={comment.author?.username ?? null}
            size={28}
            className="mt-0.5"
          />
        )}
        <div className="min-w-0 flex-1">
          {isTombstone ? (
            <p className="mt-1 text-xs italic text-muted-foreground">
              {comment.why || t`Message supprimé`}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-semibold text-foreground">{authorName}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(comment.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {comment.content}
              </p>
            </>
          )}

          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            {replyCount > 0 && (
              <button
                type="button"
                onClick={toggle}
                className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
              >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {replyCount === 1 ? t`1 réponse` : t`${replyCount} réponses`}
              </button>
            )}
            {!isTombstone && (
              <button
                type="button"
                onClick={() => {
                  setReplying((value) => !value);
                  setReplyContent('');
                }}
                className="font-medium hover:text-foreground transition-colors"
              >
                {t`Répondre`}
              </button>
            )}
            {canDelete && !isTombstone && (
              <button
                type="button"
                onClick={() => void remove()}
                className="inline-flex items-center gap-1 hover:text-destructive-text transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                {t`Supprimer`}
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-2 text-[11px] text-destructive-text">
              {error}
            </p>
          )}

          {replying && (
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
                onClick={() => void submitReply()}
                disabled={sending || !replyContent.trim()}
                className="rounded-xl bg-foreground px-3 py-2 text-[11px] font-semibold text-background disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t`Envoyer`}
              </button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div>
          {loading && (
            <p className="ml-10 mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t`Chargement des réponses…`}
            </p>
          )}
          {replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              articleId={articleId}
              currentUserId={currentUserId}
              depth={depth + 1}
              onTombstone={() => undefined}
            />
          ))}
          {hasMore && !loading && (
            <button
              type="button"
              onClick={() => void loadReplies(cursor)}
              className="ml-10 mt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {t`Afficher plus de réponses`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
