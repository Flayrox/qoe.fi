'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, UserCheck, UserPlus, Users } from 'lucide-react';

import { routes } from '@qoe/config/routes';
import { cn } from '@qoe/utils';
import { CertifiedBadge } from '@qoe/ui';
import {
  toggleFollowCreatorHomeAction as toggleFollowCreator,
  getFollowListAction,
} from '@qoe/sdk/actions/feed';
import { toast } from 'sonner';

interface FollowActor {
  id: string;
  publicationId: string | null;
  name: string | null;
  username: string | null;
  subdomain: string | null;
  logoUrl: string | null;
  isCertified: boolean;
  followedAt: string;
  viewerFollows: boolean;
}

interface FollowListProps {
  handle: string;
  initialTab: 'followers' | 'following';
  currentUserId: string | null;
}

type FollowTab = 'followers' | 'following';

/**
 * 👥 Liste des abonnés / abonnements d'un profil (web).
 * Passe par la server action getFollowListAction (repo Prisma) avec
 * pagination infinie et bouton Suivre par ligne (état viewerFollows).
 */
export function FollowList({ handle, initialTab, currentUserId }: FollowListProps) {
  const [tab, setTab] = useState<FollowTab>(initialTab);
  const [items, setItems] = useState<FollowActor[]>([]);
  const [cursor, setCursor] = useState<number | null>(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // Charge une page. `reset` repart de zéro (nouvel onglet).
  const load = useCallback(
    async (reset: boolean) => {
      if (loading) return;
      setLoading(true);
      setError(null);
      const seq = ++requestSeq.current;
      const offset = reset ? 0 : (cursor ?? 0);
      try {
        const res = await getFollowListAction({ handle, tab, cursor: offset, limit: 30 });
        // Une requête plus récente (changement d'onglet) a pris la main.
        if (seq !== requestSeq.current) return;
        if (!res.ok || !res.data) throw new Error('Erreur');
        const data = res.data;
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setCursor(data.nextCursor ? Number(data.nextCursor) : null);
        setHasMore(data.hasMore);
      } catch {
        setError('Impossible de charger la liste.');
      } finally {
        setLoading(false);
      }
    },
    [handle, tab, cursor, loading]
  );

  // Change d'onglet → réinitialise et recharge la première page.
  useEffect(() => {
    setItems([]);
    setCursor(0);
    setHasMore(false);
    setError(null);
    requestSeq.current += 1;
    void load(true);
  }, [tab]);

  const handleFollow = async (actor: FollowActor) => {
    if (!currentUserId) {
      toast.error('Veuillez vous connecter pour suivre cet auteur.');
      return;
    }
    setBusyId(actor.id);
    try {
      const res = await toggleFollowCreator(actor.publicationId || actor.id);
      if (!res.ok) {
        toast.error('Erreur lors de la modification du suivi.');
        return;
      }
      setItems((prev) =>
        prev.map((a) => (a.id === actor.id ? { ...a, viewerFollows: !a.viewerFollows } : a))
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* Segmented control */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {(
          [
            { key: 'followers' as const, label: 'Abonnés', icon: Users },
            { key: 'following' as const, label: 'Abonnements', icon: UserCheck },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer',
                isActive ? 'bg-card shadow-xs text-foreground' : 'text-muted-foreground'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && <div className="py-8 text-center text-xs text-destructive">{error}</div>}

      {items.length === 0 && !loading && !error && (
        <div className="py-12 text-center text-xs text-muted-foreground italic bg-card/40 border border-border/30 rounded-xl">
          {tab === 'followers'
            ? 'Aucun abonné pour le moment.'
            : 'Ne suit personne pour le moment.'}
        </div>
      )}

      <div className="space-y-1">
        {items.map((actor) => (
          <div
            key={actor.id}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <Link
              href={routes.feed.profile(actor.username || actor.id)}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                {actor.logoUrl ? (
                  <Image src={actor.logoUrl} alt="" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-brand text-sm">
                    {(actor.name || '?').substring(0, 2)}
                  </div>
                )}
                {actor.isCertified && (
                  <div className="absolute -bottom-1 -right-1">
                    <CertifiedBadge size={14} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {actor.name || actor.username || '?'}
                  </p>
                  {actor.isCertified && <CertifiedBadge size={13} />}
                </div>
                {actor.username && (
                  <p className="text-xs text-muted-foreground truncate">@{actor.username}</p>
                )}
              </div>
            </Link>

            {currentUserId && actor.id !== currentUserId ? (
              <button
                onClick={() => void handleFollow(actor)}
                disabled={busyId === actor.id}
                className={cn(
                  'px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0',
                  actor.viewerFollows
                    ? 'border border-border/60 bg-card hover:bg-destructive/10 hover:text-destructive text-foreground'
                    : 'bg-foreground text-background hover:opacity-90'
                )}
              >
                {busyId === actor.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : actor.viewerFollows ? (
                  'Abonné'
                ) : (
                  <span className="flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    Suivre
                  </span>
                )}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => void load(false)}
            disabled={loading}
            className="text-xs font-semibold text-brand hover:underline cursor-pointer flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Afficher plus'}
          </button>
        </div>
      )}
    </div>
  );
}
