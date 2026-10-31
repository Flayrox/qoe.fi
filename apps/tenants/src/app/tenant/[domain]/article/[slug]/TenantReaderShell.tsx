'use client';

import React from 'react';
import { ArticleReaderShell, type ArticleReaderShellProps } from '@qoe/ui/reader';

export type TenantReaderShellProps = ArticleReaderShellProps;

export function TenantReaderShell({
  className,
  disableFontOverride = true,
  ...props
}: TenantReaderShellProps) {
  return (
    <ArticleReaderShell
      className={className}
      disableFontOverride={disableFontOverride}
      {...props}
    />
  );
}
