'use client';

import React from 'react';
import { cn } from '@qoe/utils';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
import { CertifiedBadge } from '@qoe/ui/ui/CertifiedBadge';
import type { MentionSuggestion } from './types';

interface MentionTypeaheadProps {
  suggestions: MentionSuggestion[];
  selectedIndex: number;
  onSelect: (item: MentionSuggestion) => void;
}

export function MentionTypeahead({ suggestions, selectedIndex, onSelect }: MentionTypeaheadProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="relative font-sans z-[100]">
      <div className="absolute top-1 left-0 w-72 max-h-56 overflow-y-auto bg-popover text-popover-foreground border border-border/80 rounded-xl shadow-2xl p-1 font-sans animate-in fade-in-0 slide-in-from-top-1 duration-100">
        {suggestions.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={item.id || idx}
              onClick={() => onSelect(item)}
              className={cn(
                'flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors text-xs select-none',
                isSelected
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {item._type === 'profile' && (
                <>
                  <AuthorAvatar user={item} size="xs" showBadge={false} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-bold truncate text-foreground">
                        {item.name || 'Auteur'}
                      </span>
                      {item.isCertified && <CertifiedBadge />}
                    </div>
                    <span className="text-[11px] truncate text-muted-foreground">
                      @{item.username || item.subdomain}
                    </span>
                  </div>
                </>
              )}
              {item._type === 'tag' && (
                <div className="flex items-center gap-2 font-medium">
                  <span className="font-bold text-primary">#</span>
                  <span className="text-foreground">{item.value}</span>
                </div>
              )}
              {item._type === 'emoji' && (
                <div className="flex items-center gap-2 font-medium">
                  <span className="text-base">{item.char}</span>
                  <span className="text-muted-foreground text-xs">{item.name}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
