'use client';

import React from 'react';
import {
  ReadingPreferencesProvider,
  useReadingPreferences,
  getReaderTypographyClasses,
  getPaperThemeClasses,
} from './ReadingPreferencesContext';
import { TextToSpeechProvider } from './TextToSpeechContext';
import { ReadingProgressBar } from './ReadingProgressBar';
import { ReadingRuler } from './ReadingRuler';
import { useBionicReading } from './useBionicReading';
import { cn } from '@qoe/utils';

export interface ArticleReaderShellProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  themeMode?: string | null;
  articleMetadata?: {
    title: string;
    coverUrl?: string | null;
    authorName?: string | null;
    contentSelector?: string;
  };
  /** Selector for non-destructive Bionic reading (default: '#article-content') */
  bionicContentSelector?: string;
  /** Whether to display top reading progress bar (default: true) */
  showProgressBar?: boolean;
  /** Whether to render reading ruler when active in preferences (default: true) */
  showRuler?: boolean;
}

export function ArticleReaderShell({
  children,
  className = '',
  style,
  themeMode,
  articleMetadata,
  bionicContentSelector = '#article-content',
  showProgressBar = true,
  showRuler = true,
}: ArticleReaderShellProps) {
  return (
    <ReadingPreferencesProvider>
      <TextToSpeechProvider
        initialMetadata={
          articleMetadata
            ? {
                title: articleMetadata.title,
                coverUrl: articleMetadata.coverUrl,
                authorName: articleMetadata.authorName,
                contentSelector:
                  articleMetadata.contentSelector || bionicContentSelector || '#article-content',
              }
            : undefined
        }
      >
        <ArticleReaderShellInner
          className={className}
          style={style}
          themeMode={themeMode}
          bionicContentSelector={bionicContentSelector}
          showProgressBar={showProgressBar}
          showRuler={showRuler}
        >
          {children}
        </ArticleReaderShellInner>
      </TextToSpeechProvider>
    </ReadingPreferencesProvider>
  );
}

function ArticleReaderShellInner({
  children,
  className = '',
  style,
  themeMode,
  bionicContentSelector,
  showProgressBar,
  showRuler,
}: Omit<ArticleReaderShellProps, 'articleMetadata'>) {
  const { preferences } = useReadingPreferences();
  const typographyClasses = getReaderTypographyClasses(preferences);
  const paperThemeClasses = getPaperThemeClasses(preferences.paperTheme);

  // Non-destructive Bionic Reading toggle
  useBionicReading(bionicContentSelector || '#article-content', preferences.bionicReading);

  // Paper theme has precedence over publication default
  const activeThemeClass =
    preferences.paperTheme !== 'default'
      ? paperThemeClasses
      : themeMode === 'dark'
        ? 'dark bg-foreground text-background'
        : 'bg-background text-foreground';

  return (
    <div
      className={cn(
        'min-h-screen transition-colors duration-300 relative selection:bg-highlight selection:text-white',
        activeThemeClass,
        className
      )}
      style={style}
    >
      {showProgressBar && <ReadingProgressBar />}
      {showRuler && <ReadingRuler />}
      <div className={cn('w-full transition-all duration-150', typographyClasses)}>{children}</div>
    </div>
  );
}
