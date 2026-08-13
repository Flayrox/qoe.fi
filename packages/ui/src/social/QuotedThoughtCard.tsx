'use client';

import React from 'react';
import { cn } from '@qoe/utils';
import { AuthorAvatar } from '../ui/AuthorAvatar';
import { CertifiedBadge } from '../ui/CertifiedBadge';
import { TextParser } from '../ui/TextParser';
import { ProfileHoverCard } from './ProfileHoverCard';

export interface QuotedThoughtData {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt?: string | Date;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    subdomain?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  };
}

export interface QuotedThoughtCardProps {
  post: QuotedThoughtData | null;
  onOpenPost?: (postId: string) => void;
  className?: string;
}

export function QuotedThoughtCard({ post, onOpenPost, className }: QuotedThoughtCardProps) {
  if (!post) return null;

  const authorHandle =
    post.author.username || post.author.subdomain || post.author.id.slice(0, 8) || 'auteur';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpenPost) {
      onOpenPost(post.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'border border-border/40 hover:border-brand/40 rounded-xl p-3 bg-muted/20 hover:bg-muted/40 transition-all duration-200 cursor-pointer space-y-2 font-sans select-none shadow-2xs mt-2',
        className
      )}
    >
      {/* Header Author Info */}
      <div className="flex items-center gap-2">
        <AuthorAvatar user={post.author} size="xs" showBadge={false} />
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ProfileHoverCard user={post.author} username={authorHandle}>
            <span className="font-bold text-xs text-foreground hover:text-brand transition-colors cursor-pointer truncate">
              {post.author.name || 'Auteur'}
            </span>
          </ProfileHoverCard>
          {post.author.isCertified && <CertifiedBadge />}
          <ProfileHoverCard user={post.author} username={authorHandle}>
            <span className="text-xs text-muted-foreground hover:text-brand transition-colors cursor-pointer truncate">
              @{authorHandle}
            </span>
          </ProfileHoverCard>
        </div>
      </div>

      {/* Content */}
      <div className="text-xs text-foreground/90 leading-relaxed font-sans line-clamp-3">
        <TextParser content={post.content} />
      </div>

      {/* Single Image Thumbnail if present */}
      {post.imageUrl && (
        <div className="overflow-hidden rounded-lg border border-border/30 max-h-48 aspect-video mt-1">
          <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}
