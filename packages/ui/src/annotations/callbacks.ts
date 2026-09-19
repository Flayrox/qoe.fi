import type { AnnotationActionCallbacks } from './types';

export type GenericActionFn = (...args: never[]) => Promise<unknown>;

export interface StandardAnnotationActions {
  createHighlightAction: GenericActionFn;
  upvoteHighlightAction: GenericActionFn;
  createAnnotationCommentAction: GenericActionFn;
  toggleHighlightPrivacyAction: GenericActionFn;
  updateHighlightNoteAction?: GenericActionFn;
  deleteHighlightAction: GenericActionFn;
  quotePassageToFeedAction?: GenericActionFn;
  onLoginRedirect?: () => void;
}

/**
 * Creates standardized annotation callbacks for `@qoe/ui/annotations`.
 * Eliminates repetitive callback boilerplate between Core and Tenants,
 * adapting transparently to both positional and object-based action parameters.
 */
export function createAnnotationCallbacks(
  articleId: string,
  actions: StandardAnnotationActions,
  overrides?: Partial<AnnotationActionCallbacks>
): AnnotationActionCallbacks {
  const base: AnnotationActionCallbacks = {
    onHighlightCreate: async (params) => {
      const fn = actions.createHighlightAction as (arg: unknown) => Promise<unknown>;
      const res = (await fn({
        articleId: params.articleId || articleId,
        text: params.text,
        note: params.note ?? undefined,
        isPublic: !!params.isPublic,
        ...(params.quoteOrdinal !== undefined ? { quoteOrdinal: params.quoteOrdinal } : {}),
      })) as { ok?: boolean; data?: { highlight?: unknown } };

      if (res?.ok && res.data?.highlight) {
        return { ok: true, data: res.data.highlight as never };
      }
      return res?.ok !== undefined
        ? (res as never)
        : { ok: true, data: (res?.data ?? res) as never };
    },
    onUpvote: async (highlightId: string) => {
      try {
        const fn = actions.upvoteHighlightAction as (arg: unknown) => Promise<unknown>;
        const res = (await fn(highlightId)) as { ok?: boolean; data?: unknown };
        return res?.ok !== undefined
          ? (res as never)
          : { ok: true, data: (res?.data ?? res) as never };
      } catch {
        const fn = actions.upvoteHighlightAction as (arg: unknown) => Promise<unknown>;
        return (await fn({ highlightId })) as never;
      }
    },
    onComment: async (params) => {
      const fn = actions.createAnnotationCommentAction as (arg: unknown) => Promise<unknown>;
      const res = (await fn({
        highlightId: params.highlightId,
        content: params.content,
      })) as { ok?: boolean; data?: { comment?: unknown }; error?: unknown };

      if (!res?.ok) return { ok: false, error: res?.error as never };
      return { ok: true, data: (res.data?.comment ?? res.data) as never };
    },
    onTogglePrivacy: async (params) => {
      const fn = actions.toggleHighlightPrivacyAction as (arg: unknown) => Promise<unknown>;
      const res = (await fn({
        highlightId: params.highlightId,
        isPublic: params.isPublic,
      })) as { ok?: boolean; data?: { highlight?: unknown } };

      if (res?.ok && res.data?.highlight) {
        return { ok: true, data: res.data.highlight as never };
      }
      return res as never;
    },
    onUpdateNote: actions.updateHighlightNoteAction
      ? async (params) => {
          const fn = actions.updateHighlightNoteAction as (arg: unknown) => Promise<unknown>;
          const res = (await fn({
            highlightId: params.highlightId,
            note: params.note ?? null,
          })) as { ok?: boolean; data?: unknown };
          return res?.ok !== undefined
            ? (res as never)
            : { ok: true, data: (res?.data ?? res) as never };
        }
      : undefined,
    onDelete: async (highlightId: string) => {
      try {
        const fn = actions.deleteHighlightAction as (arg: unknown) => Promise<unknown>;
        const res = (await fn(highlightId)) as { ok?: boolean };
        return res?.ok !== undefined ? (res as never) : { ok: true };
      } catch {
        const fn = actions.deleteHighlightAction as (arg: unknown) => Promise<unknown>;
        const res = (await fn({ highlightId })) as { ok?: boolean };
        return res?.ok !== undefined ? (res as never) : { ok: true };
      }
    },
    onCrosspost: actions.quotePassageToFeedAction
      ? async (params) => {
          const fn = actions.quotePassageToFeedAction as (arg: unknown) => Promise<unknown>;
          return (await fn({
            articleId: params.articleId || articleId,
            text: params.text,
            commentary: params.commentary,
          })) as never;
        }
      : undefined,
    onLoginRedirect: actions.onLoginRedirect,
  };

  return {
    ...base,
    ...overrides,
  };
}
