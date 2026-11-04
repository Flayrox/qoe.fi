'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { Tabs, TabList, Tab } from '@qoe/ui/tabs';

interface FeedTabsHeaderProps {
  activeFeed: string;
  onTabChange: (id: string) => void;
}

export function FeedTabsHeader({ activeFeed, onTabChange }: FeedTabsHeaderProps) {
  const tabs = [
    { id: 'recommandation', label: t`Pour vous` },
    { id: 'abonnement', label: t`Abonnements` },
    { id: 'decouvrir', label: t`Explorer` },
    { id: 'bookmarks', label: t`Bibliothèque` },
  ];

  return (
    <Tabs
      variant="segmented"
      size="sm"
      selectedKey={activeFeed}
      onSelectionChange={(key) => onTabChange(String(key))}
      className="max-w-full overflow-x-auto no-scrollbar"
    >
      <TabList aria-label={t`Navigation du fil`}>
        {tabs.map((tab) => (
          <Tab key={tab.id} id={tab.id}>
            {tab.label}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
