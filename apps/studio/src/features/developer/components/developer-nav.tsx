'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Key, Shield, Webhook } from 'lucide-react';
import { cn } from '@qoe/utils';

export type DeveloperTab = 'overview' | 'keys' | 'webhooks' | 'oauth';

export interface DeveloperNavProps {
  activeTab?: DeveloperTab;
}

function resolveTab(pathname: string | null): DeveloperTab {
  if (pathname === '/developer/keys' || pathname?.startsWith('/developer/keys/')) return 'keys';
  if (pathname === '/developer/webhooks' || pathname?.startsWith('/developer/webhooks/')) {
    return 'webhooks';
  }
  if (pathname === '/developer/oauth' || pathname?.startsWith('/developer/oauth/')) return 'oauth';
  return 'overview';
}

export function DeveloperNav({ activeTab }: DeveloperNavProps) {
  const pathname = usePathname();
  const currentTab = activeTab ?? resolveTab(pathname);

  const tabs: Array<{ id: DeveloperTab; label: string; href: string; icon: typeof Key }> = [
    { id: 'overview', label: "Vue d'ensemble", href: '/developer', icon: BookOpen },
    { id: 'keys', label: "Clés d'API", href: '/developer/keys', icon: Key },
    { id: 'webhooks', label: 'Webhooks', href: '/developer/webhooks', icon: Webhook },
    { id: 'oauth', label: 'OAuth', href: '/developer/oauth', icon: Shield },
  ];

  return (
    <nav aria-label="Navigation développeur" className="border-b border-border/50 pb-px">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-primary bg-accent/40 text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <Icon
                className={cn('size-3.5', isActive ? 'text-primary' : 'text-muted-foreground')}
                strokeWidth={1.8}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
