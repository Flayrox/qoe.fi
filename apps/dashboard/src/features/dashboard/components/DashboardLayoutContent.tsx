'use client';

import React from 'react';
import { HeaderClient } from './HeaderClient';
import { cn } from '@qoe/utils';

export function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <main className={cn('flex-1 flex flex-col min-w-0 min-h-screen bg-background md:pl-[256px]')}>
      <HeaderClient />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:pl-4 md:pr-6 md:py-6 w-full">{children}</div>
    </main>
  );
}
