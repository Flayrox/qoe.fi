'use client';

// =====================================================================
// 🧵 ProfileReplies — onglet « Réponses » paginé par curseur
// =====================================================================
// L'onglet réutilise la pagination unique du graphe (createdAt, id) : la
// première page vient de /v1/users/{username}/replies, la suite du même
// curseur. Aucun offset, donc aucune réponse ne se répète quand l'auteur
// publie pendant la lecture.
// =====================================================================

import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { getUserRepliesAction } from '@qoe/sdk/actions/feed';
import { mapProfileSlice } from '@qoe/sdk/actions/feed/mappers';
import type { ProfilePostPayload } from '@qoe/sdk';
import { Button } from '@qoe/ui/button';
import { HiddenParentNotice } from '@qoe/ui/social';
import { ThoughtCard } from '@/components/social/ThoughtCard';

type ThoughtCardProps = ComponentProps<typeof ThoughtCard>;

interface ProfileRepliesProps {
  username: string;
  currentUserId: string | null;
  onDeletePost: ThoughtCardProps['onDeletePost'];
  onOpenPost: ThoughtCardProps['onOpenPost'];
  onOpenArticle: ThoughtCardProps['onOpenArticle'];
}

export function ProfileReplies({
  username,
  currentUserId,
  onDeletePost,
  onOpenPost,
  onOpenArticle,
}: ProfileRepliesProps) {
  const [posts, setPosts] = useState<ProfilePostPayload[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le profil change de compte sans démonter l'onglet : on repart de zéro et
  // une réponse tardive de l'ancien profil est ignorée.
  useEffect(() => {
    let cancelled = false;
    setPosts([]);
    setCursor(null);
    setHasMore(false);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getUserRepliesAction({ username });
        if (cancelled) return;
        if (res.ok) {
          setPosts(res.data.items.map(mapProfileSlice));
          setCursor(res.data.nextCursor);
          setHasMore(res.data.hasMore);
        } else {
          setError(t`Impossible de charger les réponses.`);
        }
      } catch {
        if (!cancelled) setError(t`Impossible de charger les réponses.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await getUserRepliesAction({ username, cursor });
      if (res.ok) {
        setPosts((current) => [...current, ...res.data.items.map(mapProfileSlice)]);
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
  }, [cursor, loadingMore, username]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t`Chargement des réponses…`}
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="py-4 text-xs text-destructive-text">
        {error}
      </p>
    );
  }

  if (posts.length === 0) {
    return (
      <p className="rounded-xl border border-border/30 bg-card/40 p-4 py-10 text-center text-xs italic text-muted-foreground">
        {t`Aucune réponse publiée pour le moment.`}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {posts.map((post) => (
        <div key={post.id} className="space-y-1.5">
          {post.parentUnavailable && <HiddenParentNotice reason={post.parentUnavailableReason} />}
          <ThoughtCard
            post={post}
            currentUserId={currentUserId}
            onDeletePost={onDeletePost}
            onOpenPost={onOpenPost}
            onOpenArticle={onOpenArticle}
          />
        </div>
      ))}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void loadMore()}
          loading={loadingMore}
          className="mx-auto flex gap-1.5 rounded-xl border border-border px-3 py-2 font-medium! text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal "
        >
          {t`Charger plus de réponses`}
        </Button>
      )}
    </div>
  );
}
