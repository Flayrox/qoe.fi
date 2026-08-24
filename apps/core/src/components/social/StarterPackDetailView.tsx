'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, UserCheck, Users, Loader2, Sparkles } from 'lucide-react';
import { getStarterPackByIdAction, followAllInStarterPackAction } from '@qoe/sdk';

interface StarterPackUser {
  id: string;
  name?: string | null;
  username?: string | null;
  logoUrl?: string | null;
  heroText?: string | null;
}

interface StarterPackItem {
  user: StarterPackUser;
}

interface StarterPackDetail {
  id: string;
  icon?: string | null;
  title: string;
  description?: string | null;
  creator?: { name?: string | null; username?: string | null };
  items?: StarterPackItem[];
}

export function StarterPackDetailView({ packId }: { packId: string }) {
  const [pack, setPack] = useState<StarterPackDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasFollowed, setHasFollowed] = useState(false);

  useEffect(() => {
    async function loadPack() {
      try {
        const res = await getStarterPackByIdAction({ id: packId });
        if (res.ok && res.data.starterPack) {
          setPack(res.data.starterPack);
        }
      } catch (err) {
        console.error('Error loading starter pack detail:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadPack();
  }, [packId]);

  const handleFollowAll = async () => {
    if (isFollowing || hasFollowed || !pack) return;

    setIsFollowing(true);
    try {
      const res = await followAllInStarterPackAction({ starterPackId: pack.id });
      if (res.ok && typeof res.data.followedCount === 'number') {
        setHasFollowed(true);
      }
    } catch (err) {
      console.error('Error following all in pack:', err);
    } finally {
      setIsFollowing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm font-bold text-foreground">Starter Pack introuvable</p>
        <Link href="/starter-packs" className="text-xs text-primary hover:underline">
          Retour aux Starter Packs
        </Link>
      </div>
    );
  }

  const items = pack.items || [];

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Top Header Navigation */}
      <div className="flex items-center gap-3">
        <Link
          href="/starter-packs"
          className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <span className="text-sm font-bold text-muted-foreground">Détail du Pack</span>
      </div>

      {/* Main Pack Card Hero */}
      <div className="bg-card/70 border border-border/60 backdrop-blur-md rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-2xl flex items-center justify-center shrink-0 border border-primary/20">
              {pack.icon || '🚀'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{pack.title}</h1>
              <p className="text-xs text-muted-foreground">
                Créé par {pack.creator?.name || pack.creator?.username || 'Auteur anonyme'}
              </p>
            </div>
          </div>

          <button
            onClick={handleFollowAll}
            disabled={isFollowing || hasFollowed}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs ${
              hasFollowed
                ? 'bg-muted text-muted-foreground cursor-default'
                : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-95'
            }`}
          >
            {isFollowing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : hasFollowed ? (
              <>
                <UserCheck className="w-4 h-4 text-success" />
                <span>Membres suivis</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Tout suivre ({items.length})</span>
              </>
            )}
          </button>
        </div>

        {pack.description && (
          <p className="text-sm text-foreground/80 leading-relaxed pt-1">{pack.description}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium pt-2 border-t border-border/40">
          <Users className="w-4 h-4" />
          <span>
            {items.length} profil{items.length > 1 ? 's' : ''} incl{items.length > 1 ? 'us' : 'u'}
          </span>
        </div>
      </div>

      {/* Members List */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-foreground px-1">Membres du Pack</h2>

        <div className="divide-y divide-border/40 border border-border/60 rounded-2xl bg-card/60 backdrop-blur-md overflow-hidden">
          {items.map((item) => {
            const user = item.user;
            return (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <Link
                  href={`/${user.username || user.id}`}
                  className="flex items-center gap-3 min-w-0"
                >
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                    {user.logoUrl ? (
                      <Image
                        src={user.logoUrl}
                        alt={user.name || ''}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                        {(user.name || user.username || 'U')[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground hover:text-primary transition-colors truncate">
                      {user.name || user.username}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{user.username || 'anonyme'}
                    </p>
                    {user.heroText && (
                      <p className="text-xs text-muted-foreground/80 line-clamp-1 mt-0.5">
                        {user.heroText}
                      </p>
                    )}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
