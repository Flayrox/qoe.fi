'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Repeat, Quote } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { t } from '@lingui/core/macro';

export interface RepostPopoverProps {
  reposted: boolean;
  repostsCount: number;
  targetType: 'thought' | 'article';
  onRepost: (e: React.MouseEvent) => void | Promise<void> | unknown;
  onQuote: (e: React.MouseEvent) => void | unknown;
  disabled?: boolean;
  triggerClass?: string;
  iconClass?: string;
  textClass?: string;
  showZeroCount?: boolean;
}

export function RepostPopover({
  reposted,
  repostsCount,
  targetType,
  onRepost,
  onQuote,
  disabled = false,
  triggerClass,
  iconClass = 'w-4 h-4',
  textClass = 'text-xs',
  showZeroCount,
}: RepostPopoverProps) {
  const [open, setOpen] = useState(false);

  const shouldShowCount =
    showZeroCount !== undefined
      ? showZeroCount || repostsCount > 0
      : targetType === 'thought' || repostsCount > 0;

  const handleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    await onRepost(e);
  };

  const handleQuote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    onQuote(e);
  };

  const titleText =
    targetType === 'article' ? t`Repartager ou citer l'article` : t`Repartager ou citer`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
            }}
            className={cn(
              'flex items-center gap-1.5 transition-colors cursor-pointer outline-none group/repost',
              reposted ? 'text-success-text font-semibold' : 'hover:text-success-text',
              disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
              triggerClass
            )}
            title={titleText}
            aria-label={t`Repartager`}
          >
            <motion.div whileTap={{ scale: 1.25 }} transition={{ duration: 0.15 }}>
              <Repeat
                className={cn(iconClass, 'transition-transform group-hover/repost:scale-110')}
              />
            </motion.div>
            {shouldShowCount && <span className={textClass}>{repostsCount}</span>}
          </button>
        }
      />
      <PopoverContent
        align="start"
        className="w-48 p-1.5 bg-popover/95 backdrop-blur-xl border border-border/40 shadow-2xl rounded-xl font-sans z-50"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleRepost}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
        >
          <Repeat className="w-3.5 h-3.5 text-success-text" />
          <span>{reposted ? t`Annuler le repartage` : t`Repartager`}</span>
        </button>

        <button
          type="button"
          onClick={handleQuote}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
        >
          <Quote className="w-3.5 h-3.5 text-brand" />
          <span>{targetType === 'article' ? t`Citer l'article` : t`Citer la pensée`}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
