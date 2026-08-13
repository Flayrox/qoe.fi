'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@qoe/utils';
import { useTranslate } from '@qoe/i18n';

interface FeedTabsHeaderProps {
  activeFeed: string;
  onTabChange: (id: string) => void;
}

export function FeedTabsHeader({ activeFeed, onTabChange }: FeedTabsHeaderProps) {
  const { t } = useTranslate();

  const tabs = [
    { id: 'recommandation', label: t('feed.tab_for_you', 'Pour vous') },
    { id: 'abonnement', label: t('feed.tab_following', 'Abonnements') },
    { id: 'decouvrir', label: t('feed.tab_discover', 'Explorer') },
    { id: 'bookmarks', label: t('feed.tab_library', 'Bibliothèque') },
  ];

  return (
    <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => {
        const active = activeFeed === tab.id;

        return (
          <motion.button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'relative px-3 py-1 rounded-full',
              'text-xs font-semibold tracking-tight',
              'outline-none cursor-pointer transition-all duration-200 select-none',
              active
                ? 'text-foreground bg-muted/60'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            )}
          >
            {tab.label}

            {active && (
              <motion.div
                layoutId="feedTabActiveBg"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="absolute inset-0 rounded-full bg-muted/80 -z-10 border border-border/50"
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
