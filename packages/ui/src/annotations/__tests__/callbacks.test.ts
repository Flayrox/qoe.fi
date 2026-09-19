import { describe, it, expect, vi } from 'vitest';
import { createAnnotationCallbacks } from '../callbacks';

describe('createAnnotationCallbacks adapter', () => {
  it('correctly maps highlight creation and returns highlight data', async () => {
    const createHighlightAction = vi.fn().mockResolvedValue({
      ok: true,
      data: { highlight: { id: 'hl-123', text: 'Citation mémorable' } },
    });

    const callbacks = createAnnotationCallbacks('article-42', {
      createHighlightAction,
      upvoteHighlightAction: vi.fn(),
      createAnnotationCommentAction: vi.fn(),
      toggleHighlightPrivacyAction: vi.fn(),
      deleteHighlightAction: vi.fn(),
    });

    const res = await callbacks.onHighlightCreate?.({
      text: 'Citation mémorable',
      note: 'Note de réflexion',
      isPublic: true,
    });

    expect(createHighlightAction).toHaveBeenCalledWith({
      articleId: 'article-42',
      text: 'Citation mémorable',
      note: 'Note de réflexion',
      isPublic: true,
    });
    expect(res).toEqual({
      ok: true,
      data: { id: 'hl-123', text: 'Citation mémorable' },
    });
  });

  it('handles positional upvote/delete as well as object-based upvote/delete', async () => {
    const upvotePositional = vi.fn().mockResolvedValue({ ok: true, data: { upvotesCount: 5 } });
    const deletePositional = vi.fn().mockResolvedValue({ ok: true });

    const callbacks = createAnnotationCallbacks('article-42', {
      createHighlightAction: vi.fn(),
      upvoteHighlightAction: upvotePositional,
      createAnnotationCommentAction: vi.fn(),
      toggleHighlightPrivacyAction: vi.fn(),
      deleteHighlightAction: deletePositional,
    });

    const upvoteRes = await callbacks.onUpvote?.('hl-999');
    expect(upvotePositional).toHaveBeenCalledWith('hl-999');
    expect(upvoteRes).toEqual({ ok: true, data: { upvotesCount: 5 } });

    const deleteRes = await callbacks.onDelete?.('hl-999');
    expect(deletePositional).toHaveBeenCalledWith('hl-999');
    expect(deleteRes).toEqual({ ok: true });
  });

  it('allows custom overrides to replace or extend base callbacks', async () => {
    const customCrosspost = vi.fn().mockResolvedValue({ ok: true });

    const callbacks = createAnnotationCallbacks(
      'article-42',
      {
        createHighlightAction: vi.fn(),
        upvoteHighlightAction: vi.fn(),
        createAnnotationCommentAction: vi.fn(),
        toggleHighlightPrivacyAction: vi.fn(),
        deleteHighlightAction: vi.fn(),
      },
      {
        onCrosspost: customCrosspost,
      }
    );

    await callbacks.onCrosspost?.({
      articleId: 'article-42',
      text: 'Extrait pour le feed',
      commentary: 'Mon avis',
    });

    expect(customCrosspost).toHaveBeenCalledWith({
      articleId: 'article-42',
      text: 'Extrait pour le feed',
      commentary: 'Mon avis',
    });
  });
});
