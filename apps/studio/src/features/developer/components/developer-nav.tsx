import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Key, Webhook, Shield, BookOpen, ExternalLink } from 'lucide-react';
import { cn } from '@qoe/utils';

export interface DeveloperNavProps {
  activeTab?: 'keys' | 'webhooks' | 'docs' | 'oauth';
}

export function DeveloperNav({ activeTab }: DeveloperNavProps) {
  const pathname = usePathname();

  const currentTab =
    activeTab ||
    (pathname?.includes('/developer/webhooks')
      ? 'webhooks'
      : pathname?.includes('/developer/oauth')
        ? 'oauth'
        : 'keys');

  const tabs = [
    {
      id: 'keys',
      label: "Clés d'API",
      href: '/developer',
      icon: Key,
    },
    {
      id: 'webhooks',
      label: 'Webhooks & Événements',
      href: '/developer/webhooks',
      icon: Webhook,
    },
    {
      id: 'oauth',
      label: 'Applications OAuth',
      href: '/developer/oauth',
      icon: Shield,
    },
  ];

  return (
    <div className="flex items-center justify-between border-b border-border/80 pb-px gap-4">
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-200 border-b-2 relative shrink-0',
                isActive
                  ? 'border-primary text-foreground bg-accent/40 font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Icon
                className={cn(
                  'w-3.5 h-3.5 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      <a
        href="https://docs.qoe.fi"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors shrink-0 rounded-lg hover:bg-muted/40"
        title="Consulter la documentation officielle sur docs.qoe.fi"
      >
        <BookOpen className="w-3.5 h-3.5 text-primary/80" />
        <span className="hidden sm:inline">Documentation API</span>
        <span className="sm:hidden">Docs</span>
        <ExternalLink className="w-3 h-3 opacity-70" />
      </a>
    </div>
  );
}
