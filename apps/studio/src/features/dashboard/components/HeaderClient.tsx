'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Command, Menu } from 'lucide-react';
import { toast } from 'sonner';
import { ThemeToggle, useCommandMenu } from '@qoe/ui';

import { HeaderWorkspaceSwitcher } from './HeaderWorkspaceSwitcher';

export function HeaderClient() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const alreadyOnboarded = searchParams.get('already_onboarded');
  const { setIsOpen } = useCommandMenu();

  // Check for already_onboarded query parameter to show toast
  useEffect(() => {
    if (alreadyOnboarded === 'true') {
      toast.error("Tu es déjà créateur, tu ne peux pas recommencer l'onboarding !");
      const newUrl = window.location.pathname;
      window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
    }
  }, [alreadyOnboarded]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center bg-background/80 px-4 backdrop-blur-md select-none font-sans">
      <div className="w-full flex items-center justify-between">
        {/* Left: Mobile Trigger & Search Bar */}
        <div className="flex items-center gap-2.5 md:gap-4">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-mobile-sidebar'))}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-lg bg-muted/50 border border-border/30 active:scale-95 transition-all"
            aria-label="Ouvrir la navigation"
          >
            <Menu className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          </button>

          <button
            onClick={() => setIsOpen(true)}
            className="w-48 sm:w-72 md:w-80 flex items-center justify-between font-sans text-xs text-muted-foreground/80 bg-muted/50 border border-transparent rounded-lg py-1.5 px-3.5 hover:bg-muted hover:text-foreground transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
              <span className="text-[13px] font-normal">Rechercher...</span>
            </div>
            <div className="flex items-center gap-0.5 border border-border/30 bg-background/60 text-[10px] px-1.5 py-0.5 rounded font-medium text-muted-foreground select-none">
              <Command className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} />
              <span>K</span>
            </div>
          </button>
        </div>

        {/* Right: Workspace Switcher & Navigation Links */}
        <div className="flex items-center gap-3 md:gap-6 font-sans text-xs font-semibold">
          <HeaderWorkspaceSwitcher />

          <nav className="hidden lg:flex items-center gap-5">
            <button
              onClick={() => router.push('/')}
              className={
                pathname === '/'
                  ? 'text-primary border-b-2 border-primary py-1.5 transition-colors cursor-pointer'
                  : 'text-muted-foreground hover:text-foreground py-1.5 transition-colors cursor-pointer'
              }
            >
              Writer
            </button>
            <button
              onClick={() => router.push('/audience')}
              className={
                pathname.startsWith('/audience') || pathname.startsWith('/analytics')
                  ? 'text-primary border-b-2 border-primary py-1.5 transition-colors cursor-pointer'
                  : 'text-muted-foreground hover:text-foreground py-1.5 transition-colors cursor-pointer'
              }
            >
              Studio
            </button>
            <button
              onClick={() => router.push('/advanced')}
              className={
                pathname.startsWith('/advanced')
                  ? 'text-primary border-b-2 border-primary py-1.5 transition-colors cursor-pointer'
                  : 'text-muted-foreground hover:text-foreground py-1.5 transition-colors cursor-pointer'
              }
            >
              Advanced
            </button>
          </nav>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
