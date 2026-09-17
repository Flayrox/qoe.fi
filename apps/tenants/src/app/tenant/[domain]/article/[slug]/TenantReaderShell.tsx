'use client';

import React from 'react';
import {
  ReadingPreferencesProvider,
  useReadingPreferences,
  ReadingProgressBar,
  ReadingRuler,
  getReaderTypographyClasses,
  getPaperThemeClasses,
  useBionicReading,
} from '@qoe/ui/reader';
import { cn } from '@qoe/utils';

interface TenantReaderShellProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  themeMode?: string | null;
}

export function TenantReaderShell({
  children,
  className = '',
  style,
  themeMode,
}: TenantReaderShellProps) {
  return (
    <ReadingPreferencesProvider>
      <TenantReaderShellInner className={className} style={style} themeMode={themeMode}>
        {children}
      </TenantReaderShellInner>
    </ReadingPreferencesProvider>
  );
}

function TenantReaderShellInner({
  children,
  className = '',
  style,
  themeMode,
}: TenantReaderShellProps) {
  const { preferences } = useReadingPreferences();
  const typographyClasses = getReaderTypographyClasses(preferences);
  const paperThemeClasses = getPaperThemeClasses(preferences.paperTheme);

  // Non-destructive Bionic Reading toggle for #article-content
  useBionicReading('#article-content', preferences.bionicReading);

  // Active theme determination: Paper theme has precedence over publication default
  const activeThemeClass =
    preferences.paperTheme !== 'default'
      ? paperThemeClasses
      : themeMode === 'dark'
        ? 'dark bg-foreground text-background'
        : 'bg-background text-foreground';

  return (
    <div
      className={cn(
        'min-h-screen transition-colors duration-300 relative selection:bg-[var(--tenant-accent)] selection:text-white',
        activeThemeClass,
        className
      )}
      style={style}
    >
      <ReadingProgressBar />
      <ReadingRuler />
      <div className={cn('w-full transition-all duration-150', typographyClasses)}>{children}</div>
    </div>
  );
}
