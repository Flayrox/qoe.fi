import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { CanonicalDocument } from '@qoe/sdk/mobile';

import { ArticleHtml, type SelectionInfo } from './html-blocks';
import { NativeArticleBody } from './native';
import type { MarkHighlightInput } from './native/marks';

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class NativeArticleErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[NativeArticleBody] Erreur de rendu natif, repli sur ArticleHtml :', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export interface ArticleBodyProps {
  html: string;
  document?: CanonicalDocument;
  highlights?: (MarkHighlightInput | null | undefined)[];
  selection: SelectionInfo | null;
  onSelect: (info: SelectionInfo | null) => void;
  onScrollLock?: (locked: boolean) => void;
  spotlight?: { start: number; end: number; sha: string } | null;
  onSpotlightMeasured?: (tokenWindowY: number) => void;
}

/**
 * Sélecteur de moteur de rendu :
 * - Si document canonique disponible et plateforme Android -> NativeArticleBody (avec repli de secours).
 * - Sinon -> ArticleHtml historique (tokens mesurés).
 */
export function ArticleBody(props: ArticleBodyProps) {
  const {
    html,
    document,
    highlights,
    selection,
    onSelect,
    onScrollLock,
    spotlight,
    onSpotlightMeasured,
  } = props;

  const fallback = (
    <ArticleHtml
      html={html}
      highlights={highlights ?? []}
      document={document}
      selection={selection}
      onSelect={onSelect}
      onScrollLock={onScrollLock}
      spotlight={spotlight}
      onSpotlightMeasured={onSpotlightMeasured}
    />
  );

  // Pour Android, si le document canonique est disponible, on privilégie le moteur natif
  if (Platform.OS === 'android' && document) {
    return (
      <NativeArticleErrorBoundary fallback={fallback}>
        <NativeArticleBody
          document={document}
          highlights={highlights}
          selection={selection}
          onSelect={onSelect}
          onScrollLock={onScrollLock}
          spotlight={spotlight}
          onSpotlightMeasured={onSpotlightMeasured}
        />
      </NativeArticleErrorBoundary>
    );
  }

  return fallback;
}
