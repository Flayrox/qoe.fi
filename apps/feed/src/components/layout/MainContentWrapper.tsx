'use client';

import React from 'react';
import { cn } from '@qoe/utils';

export function MainContentWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn('min-h-screen transition-all duration-300 w-full md:pl-[256px]')}>
      <main className="min-w-0 w-full min-h-screen">{children}</main>
    </div>
  );
}
