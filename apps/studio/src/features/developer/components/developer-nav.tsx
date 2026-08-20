import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Key, Webhook, Shield } from 'lucide-react';
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
    <div className="flex items-center gap-1.5 border-b border-border/80 pb-px overflow-x-auto scrollbar-none">
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
  );
}
