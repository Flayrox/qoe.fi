'use client';

import React from 'react';
import { ArticleReaderShell, type ArticleReaderShellProps } from '@qoe/ui/reader';
import { cn } from '@qoe/utils';

export type TenantReaderShellProps = ArticleReaderShellProps;

export function TenantReaderShell({ className, ...props }: TenantReaderShellProps) {
  return (
    <ArticleReaderShell
      className={cn('selection:bg-[var(--tenant-accent)] selection:text-white', className)}
      {...props}
    />
  );
}
