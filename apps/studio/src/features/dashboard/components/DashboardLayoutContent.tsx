import React from 'react';
import { HeaderClient } from './HeaderClient';
import { cn } from '@qoe/utils';

export function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <main className={cn('flex-1 flex flex-col min-w-0 min-h-screen bg-background md:pl-[256px]')}>
      <HeaderClient />

      {/* Main Content Area — padding unique de tous les écrans du Studio. */}
      <div className="w-full flex-1 px-4 py-5 sm:px-6 md:pl-4 lg:px-10 lg:py-8">{children}</div>
    </main>
  );
}
