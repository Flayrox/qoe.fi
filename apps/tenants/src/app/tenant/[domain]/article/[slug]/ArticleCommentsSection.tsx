'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, Reply, Trash2, Loader2 } from 'lucide-react';
import { postArticleCommentAction, deleteArticleCommentAction } from '@qoe/sdk/actions/articles';

import { cn } from '@qoe/utils';
import Image from 'next/image';
import { useRequireAuth } from '@qoe/ui';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Textarea } from '@qoe/ui/input';
import { t } from '@lingui/core/macro';

export interface CommentAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  subdomain?: string | null;
}

export interface CommentReplyItem {
  id: string;
  content: string;
  createdAt: Date | string;
  author: CommentAuthor;
}

export interface CommentItem {
  id: string;
  content: string;
  createdAt: Date | string;
  author: CommentAuthor;
  replies: CommentReplyItem[];
}

interface ArticleCommentsSectionProps {
  articleId: string;
  initialComments: CommentItem[];
  isAuthenticated: boolean;
  currentUserId?: string | null;
  allowComments?: boolean;
  mainAppUrl: string;
  isBrutalist?: boolean;
}

export function ArticleCommentsSection({
  articleId,
  initialComments,
  isAuthenticated,
  currentUserId,
  allowComments = true,
  isBrutalist = false,
}: ArticleCommentsSectionProps) {
  const { openAuthModal } = useRequireAuth();
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [newCommentText, setNewCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleLoginRedirect = () => {
    openAuthModal({ mode: 'signup', actionContext: 'comment' });
  };

  // Handle top-level comment submission
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    if (!newCommentText.trim()) return;

    setSubmitting(true);
    try {
      const res = await postArticleCommentAction({ articleId, content: newCommentText });
      if (res.ok && res.data) {
        const formattedComment: CommentItem = {
          id: res.data.id,
          content: res.data.content,
          createdAt: res.data.createdAt,
          author: res.data.author,
          replies: [],
        };
        setComments((prev) => [formattedComment, ...prev]);
        setNewCommentText('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle nested reply submission
  const handleSubmitReply = async (parentId: string) => {
    if (!isAuthenticated) {
      handleLoginRedirect();
      return;
    }

    if (!replyText.trim()) return;

    setSubmittingReply(true);
    try {
      const res = await postArticleCommentAction({ articleId, content: replyText, parentId });
      if (res.ok && res.data) {
        const formattedReply: CommentReplyItem = {
          id: res.data.id,
          content: res.data.content,
          createdAt: res.data.createdAt,
          author: res.data.author,
        };

        setComments((prev) =>
          prev.map((c) => {
            if (c.id === parentId) {
              return {
                ...c,
                replies: [...c.replies, formattedReply],
              };
            }
            return c;
          })
        );
        setReplyText('');
        setReplyingToId(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReply(false);
    }
  };

  // Handle comment deletion
  const handleDeleteComment = async (commentId: string, parentId?: string) => {
    if (!confirm(t`Voulez-vous vraiment supprimer ce commentaire ?`)) return;

    setDeletingId(commentId);
    try {
      const res = await deleteArticleCommentAction(commentId);
      if (res.ok) {
        if (parentId) {
          setComments((prev) =>
            prev.map((c) => {
              if (c.id === parentId) {
                return {
                  ...c,
                  replies: c.replies.filter((r) => r.id !== commentId),
                };
              }
              return c;
            })
          );
        } else {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const totalCount = comments.reduce((acc, c) => acc + 1 + (c.replies?.length ?? 0), 0);

  return (
    <section id="comments" className="mt-16 pt-12 border-t border-border/40 space-y-8 select-text">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)]">
            <MessageSquare className="w-5 h-5 stroke-[1.5]" />
          </div>
          <h3
            className={`text-2xl ${isBrutalist ? 'font-black uppercase' : 'font-bold text-foreground'}`}
          >
            {t`Commentaires`}
          </h3>

          <Badge variant="soft" tone="neutral" shape="pill" size="sm">
            {totalCount}
          </Badge>
        </div>
      </div>

      {/* Write Comment Form or Disabled Notice */}
      {allowComments ? (
        <form onSubmit={handleSubmitComment} className="space-y-3">
          <div
            className={`p-4 rounded-2xl ${isBrutalist ? 'border-4 border-foreground bg-card' : 'bg-card border border-border/40 shadow-xs'}`}
          >
            <Textarea
              rows={3}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              onClick={() => {
                if (!isAuthenticated) handleLoginRedirect();
              }}
              placeholder={
                isAuthenticated
                  ? t`Partagez votre réflexion sur cet écrit...`
                  : t`Connectez-vous pour laisser un commentaire...`
              }
              className="border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                {!isAuthenticated && t`Rejoignez la discussion`}
              </span>

              <Button
                type="submit"
                variant="solid"
                tone={isBrutalist ? 'neutral' : 'brand'}
                size="sm"
                disabled={submitting || (!isAuthenticated ? false : !newCommentText.trim())}
                className={cn(
                  isBrutalist
                    ? 'border-2 border-foreground uppercase'
                    : 'bg-[var(--tenant-accent)] text-primary-foreground hover:bg-[var(--tenant-accent)]/90'
                )}
              >
                {submitting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <>
                    <Send />
                    <span>{t`Publier`}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 text-center text-xs text-muted-foreground font-medium italic font-sans">
          {t`Les commentaires ont été désactivés par l'auteur sur cet écrit.`}
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-6">
        {comments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border/40 rounded-2xl">
            {t`Aucun commentaire pour le moment. Soyez le premier à réagir !`}
          </div>
        ) : (
          comments.map((comment) => (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-5 rounded-2xl space-y-4 ${isBrutalist ? 'border-2 border-foreground bg-card' : 'bg-card/60 border border-border/30'}`}
            >
              {/* Comment Author Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted border border-border/40 flex items-center justify-center overflow-hidden shrink-0">
                    {comment.author.logoUrl ? (
                      <Image
                        src={comment.author.logoUrl}
                        alt={comment.author.name || t`Auteur`}
                        width={36}
                        height={36}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-bold text-xs uppercase text-muted-foreground">
                        {(comment.author.name || comment.author.username || 'A')[0]}
                      </span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      {comment.author.name || comment.author.username || t`Lecteur`}
                    </h4>
                    <span className="text-[11px] text-muted-foreground font-sans">
                      {new Date(comment.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {currentUserId === comment.author.id && (
                  <Button
                    variant="ghost"
                    tone="danger"
                    size="xs"
                    shape="icon"
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={deletingId === comment.id}
                    title={t`Supprimer`}
                    aria-label={t`Supprimer`}
                  >
                    {deletingId === comment.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                )}
              </div>

              {/* Comment Content */}
              <p className="text-sm text-foreground leading-relaxed pl-12 whitespace-pre-line font-sans">
                {comment.content}
              </p>

              {/* Reply Trigger */}
              <div className="pl-12 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if (!isAuthenticated) {
                      handleLoginRedirect();
                    } else {
                      setReplyingToId(replyingToId === comment.id ? null : comment.id);
                    }
                  }}
                  className="h-auto px-1.5 py-0.5 text-muted-foreground hover:text-[var(--tenant-accent)]"
                >
                  <Reply />
                  <span>{t`Répondre`}</span>
                </Button>
              </div>

              {/* Inline Reply Input */}
              {replyingToId === comment.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pl-12 pt-2 space-y-2"
                >
                  <Textarea
                    rows={2}
                    size="sm"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t`Répondre à ${comment.author.name || t`ce lecteur`}...`}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="xs" onClick={() => setReplyingToId(null)}>
                      {t`Annuler`}
                    </Button>

                    <Button
                      variant="solid"
                      tone="brand"
                      size="xs"
                      disabled={submittingReply || !replyText.trim()}
                      onClick={() => handleSubmitReply(comment.id)}
                      className="bg-[var(--tenant-accent)] text-primary-foreground hover:bg-[var(--tenant-accent)]/90"
                    >
                      {submittingReply ? <Loader2 className="animate-spin" /> : t`Envoyer`}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Nested Replies List */}
              {(comment.replies?.length ?? 0) > 0 && (
                <div className="pl-8 pt-3 space-y-3 border-l-2 border-border/30 ml-4">
                  {comment.replies.map((reply) => (
                    <div
                      key={reply.id}
                      className="p-3 rounded-xl bg-muted/30 border border-border/20 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-bold uppercase text-muted-foreground">
                            {reply.author.logoUrl ? (
                              <Image
                                src={reply.author.logoUrl}
                                alt={reply.author.name || t`Auteur`}
                                width={24}
                                height={24}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (reply.author.name || reply.author.username || 'A')[0]
                            )}
                          </div>
                          <span className="text-xs font-semibold text-foreground">
                            {reply.author.name || reply.author.username || t`Lecteur`}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(reply.createdAt).toLocaleDateString('fr-FR', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>

                        {currentUserId === reply.author.id && (
                          <Button
                            variant="ghost"
                            tone="danger"
                            size="xs"
                            shape="icon"
                            onClick={() => handleDeleteComment(reply.id, comment.id)}
                            aria-label={t`Supprimer`}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-foreground leading-relaxed pl-8 whitespace-pre-line font-sans">
                        {reply.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </section>
  );
}
