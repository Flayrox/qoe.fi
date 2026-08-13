'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { UserCheck, Users, Loader2, Sparkles } from 'lucide-react';
import { followAllInStarterPackAction } from '@qoe/api-client';

export interface StarterPackCardProps {
  pack: {
    id: string;
    title: string;
    description?: string | null;
    icon?: string | null;
    creator: {
      id: string;
      name?: string | null;
      username?: string | null;
      logoUrl?: string | null;
    };
    items?: Array<{
      user: {
        id: string;
        name?: string | null;
        username?: string | null;
        logoUrl?: string | null;
      };
    }>;
    _count?: {
      items: number;
    };
  };
}

export function StarterPackCard({ pack }: StarterPackCardProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasFollowed, setHasFollowed] = useState(false);
  const [followedCount, setFollowedCount] = useState<number | null>(null);

  const itemCount = pack._count?.items ?? pack.items?.length ?? 0;
  const previewItems = pack.items?.slice(0, 5) || [];

  const handleFollowAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isFollowing || hasFollowed) return;

    setIsFollowing(true);
    try {
      const res = await followAllInStarterPackAction({ starterPackId: pack.id });
      if (res.ok && typeof res.data.followedCount === 'number') {
        setHasFollowed(true);
        setFollowedCount(res.data.followedCount);
      }
    } catch (err) {
      console.error('Error following all in starter pack:', err);
    } finally {
      setIsFollowing(false);
    }
  };

  return (
    <div className="group relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md p-5 space-y-4 hover:border-primary/40 transition-all duration-200 shadow-xs">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-xl flex items-center justify-center shrink-0 border border-primary/20">
            {pack.icon || '🚀'}
          </div>
          <div className="min-w-0">
            <Link
              href={`/starter-packs/${pack.id}`}
              className="font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1"
            >
              {pack.title}
            </Link>
            <p className="text-xs text-muted-foreground truncate">
              Par {pack.creator.name || pack.creator.username || 'Auteur anonyme'}
            </p>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={handleFollowAll}
          disabled={isFollowing || hasFollowed}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shadow-2xs ${
            hasFollowed
              ? 'bg-muted text-muted-foreground cursor-default'
              : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-95'
          }`}
        >
          {isFollowing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : hasFollowed ? (
            <>
              <UserCheck className="w-3.5 h-3.5 text-success" />
              <span>Suivi ({followedCount ?? itemCount})</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tout suivre</span>
            </>
          )}
        </button>
      </div>

      {/* Description */}
      {pack.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {pack.description}
        </p>
      )}

      {/* Avatars Stack & Count */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <div className="flex items-center -space-x-2 overflow-hidden py-1">
          {previewItems.map((item, idx) => (
            <div
              key={item.user.id || idx}
              className="inline-block h-7 w-7 rounded-full ring-2 ring-background bg-muted overflow-hidden shrink-0"
            >
              {item.user.logoUrl ? (
                <Image
                  src={item.user.logoUrl}
                  alt={item.user.name || 'Avatar'}
                  width={28}
                  height={28}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
                  {(item.user.name || item.user.username || 'U')[0].toUpperCase()}
                </div>
              )}
            </div>
          ))}
          {itemCount > 5 && (
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-2 ring-background shrink-0">
              +{itemCount - 5}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
          <Users className="w-3.5 h-3.5" />
          <span>
            {itemCount} membre{itemCount > 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
