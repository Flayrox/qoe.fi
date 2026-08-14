import React from 'react';
import { TextHighlighter, type AnnotationItem, type HighlightItem } from '@qoe/ui/annotations';
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
}: TenantArticleHighlighterProps) {
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
      callbacks={{
        onHighlightCreate: async (params) =>
          createHighlightAction({
            articleId: params.articleId || articleId,
            text: params.text,
            note: params.note || undefined,
            isPublic: params.isPublic,
          }),
        onUpvote: async (highlightId: string) => upvoteHighlightAction(highlightId),
        onComment: async (params) =>
          createAnnotationCommentAction({
            highlightId: params.highlightId,
            content: params.content,
          }),
        onTogglePrivacy: async (params) =>
          toggleHighlightPrivacyAction({
            highlightId: params.highlightId,
            isPublic: params.isPublic,
          }),
        onUpdateNote: async (params) =>
          updateHighlightNoteAction({
            highlightId: params.highlightId,
            note: params.note,
          }),
        onDelete: async (highlightId: string) => {
          const res = await deleteHighlightAction(highlightId);
          return res.ok ? { ok: true } : { ok: false, error: res.error };
        },
        onCrosspost: async (params) =>
          quotePassageToFeedAction({
            articleId: params.articleId || articleId,
            text: params.text,
            commentary: params.commentary,
          }),
      }}
    />
  );
}
