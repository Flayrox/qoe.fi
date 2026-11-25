'use client';

import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Command, Menu } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { ThemeToggle, useCommandMenu } from '@qoe/ui';

import { HeaderWorkspaceSwitcher } from './HeaderWorkspaceSwitcher';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';

export function HeaderClient() {
  const searchParams = useSearchParams();
  const alreadyOnboarded = searchParams.get('already_onboarded');
  const { setIsOpen } = useCommandMenu();

  // Check for already_onboarded query parameter to show toast
  useEffect(() => {
    if (alreadyOnboarded === 'true') {
      toast.error(t`Tu es déjà créateur, tu ne peux pas recommencer l'onboarding !`);
      const newUrl = window.location.pathname;
      window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
    }
  }, [alreadyOnboarded]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center bg-background/80 px-4 backdrop-blur-md select-none font-sans">
      <div className="w-full flex items-center justify-between">
        {/* Left: Mobile Trigger & Search Bar */}
        <div className="flex items-center gap-2.5 md:gap-4">
          <Button
            variant="outline"
            shape="icon"
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-mobile-sidebar'))}
            className="rounded-lg border-border/30 bg-muted/50 p-2 text-muted-foreground active:scale-95 hover:text-foreground md:hidden h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal "
            aria-label={t`Ouvrir la navigation`}
          >
            <Menu className="w-4! h-4! shrink-0" strokeWidth={1.5} />
          </Button>

          <Button
            variant="ghost"
            onClick={() => setIsOpen(true)}
            className="w-48! items-center justify-between rounded-lg border border-transparent bg-muted/50 px-3.5 py-1.5 font-sans text-xs! text-muted-foreground/80 hover:bg-muted hover:text-foreground sm:w-72 md:w-80 leading-[16px]! h-auto! [font-weight:inherit]! whitespace-normal! "
          >
            <div className="flex items-center gap-2.5">
              <Search
                className="w-3.5! h-3.5! shrink-0 text-muted-foreground/70"
                strokeWidth={1.5}
              />
              <span className="text-[13px] font-normal">{t`Rechercher...`}</span>
            </div>
            <div className="flex items-center gap-0.5 border border-border/30 bg-background/60 text-[10px] px-1.5 py-0.5 rounded font-medium text-muted-foreground select-none">
              <Command className="w-2.5! h-2.5! shrink-0" strokeWidth={1.5} />
              <span>K</span>
            </div>
          </Button>
        </div>

        {/* Right: Workspace Switcher & Navigation Links */}
        <div className="flex items-center gap-3 md:gap-6 font-sans text-xs font-semibold">
          <HeaderWorkspaceSwitcher />

          <nav className="hidden lg:flex items-center gap-5">
            {[t`Writer`, t`Studio`, t`Advanced`].map((label) => (
              <Button
                key={label}
                variant="ghost"
                disabled
                aria-disabled="true"
                title={t`Bientôt disponible`}
                className="select-none rounded-none border-b-2 border-transparent py-1.5 text-muted-foreground/45 opacity-60 hover:bg-transparent h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block px-0 "
              >
                {label}
              </Button>
            ))}
          </nav>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
