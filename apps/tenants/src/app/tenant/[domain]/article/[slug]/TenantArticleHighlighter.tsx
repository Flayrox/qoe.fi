'use client';

import React from 'react';
import {
  TextHighlighter,
  createAnnotationCallbacks,
  type AnnotationItem,
  type HighlightItem,
  type CanonicalDocument,
} from '@qoe/ui/annotations';
import {
  createHighlightAction,
  upvoteHighlightAction,
  createAnnotationCommentAction,
  toggleHighlightPrivacyAction,
  updateHighlightNoteAction,
  deleteHighlightAction,
  quotePassageToFeedAction,
} from './actions';

export interface TenantArticleHighlighterProps {
  articleId: string;
  creatorName: string;
  allowPublicAnnotations: boolean;
  isAuthenticated: boolean;
  initialHighlights: HighlightItem[] | AnnotationItem[];
  publicHighlights: AnnotationItem[];
  currentUserId: string | null;
  currentUserProfile: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
  } | null;
  articleAuthorId: string;
  mainAppUrl: string;
  /** Document canonique : le corps est rendu par blocs (marques par offsets). */
  canonicalDocument?: CanonicalDocument | null;
  /** Classes du conteneur du corps d'article (mode document uniquement). */
  contentClassName?: string;
}

export function TenantArticleHighlighter({
  articleId,
  creatorName,
  allowPublicAnnotations,
  isAuthenticated,
  initialHighlights,
  publicHighlights,
  currentUserId,
  currentUserProfile,
  articleAuthorId,
  mainAppUrl,
  canonicalDocument,
  contentClassName,
}: TenantArticleHighlighterProps) {
  const callbacks = React.useMemo(
    () =>
      createAnnotationCallbacks(articleId, {
        createHighlightAction,
        upvoteHighlightAction,
        createAnnotationCommentAction,
        toggleHighlightPrivacyAction,
        updateHighlightNoteAction,
        deleteHighlightAction,
        quotePassageToFeedAction,
      }),
    [articleId]
  );

  return (
    <TextHighlighter
      articleId={articleId}
      creatorName={creatorName}
      allowPublicAnnotations={allowPublicAnnotations}
      isAuthenticated={isAuthenticated}
      initialHighlights={initialHighlights}
      publicHighlights={publicHighlights}
      currentUserId={currentUserId}
      currentUserProfile={currentUserProfile}
      articleAuthorId={articleAuthorId}
      mainAppUrl={mainAppUrl}
      canonicalDocument={canonicalDocument ?? undefined}
      contentClassName={contentClassName}
      callbacks={callbacks}
    />
  );
}
