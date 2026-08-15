import { describe, expect, it } from 'vitest';
import { normalizeArticleAttributions, visibleArticleAttributions } from './article-attribution';

describe('article attributions', () => {
  it('creates a visible, accepted primary author when no explicit byline exists', () => {
    expect(normalizeArticleAttributions(undefined, 'author-1')).toEqual([
      {
        userId: 'author-1',
        role: 'PRIMARY_AUTHOR',
        order: 0,
        isVisible: true,
        consentStatus: 'ACCEPTED',
      },
    ]);
  });

  it('deduplicates users, forces the primary author first, and makes new contributors pending', () => {
    const result = normalizeArticleAttributions(
      [
        { userId: 'co-author', role: 'EDITOR', order: 1 },
        { userId: 'author-1', role: 'CO_AUTHOR', order: 9, isVisible: false },
        { userId: 'co-author', role: 'CO_AUTHOR', order: 8 },
        { userId: 'translator', role: 'TRANSLATOR' },
      ],
      'author-1'
    );

    expect(result).toEqual([
      {
        userId: 'author-1',
        role: 'PRIMARY_AUTHOR',
        order: 0,
        isVisible: true,
        consentStatus: 'ACCEPTED',
      },
      {
        userId: 'co-author',
        role: 'CO_AUTHOR',
        order: 8,
        isVisible: true,
        consentStatus: 'PENDING',
      },
      {
        userId: 'translator',
        role: 'TRANSLATOR',
        order: Number.MAX_SAFE_INTEGER + 3,
        isVisible: true,
        consentStatus: 'PENDING',
      },
    ]);
  });

  it('never hides the primary author but can hide secondary contributors', () => {
    const result = normalizeArticleAttributions(
      [
        { userId: 'author-1', isVisible: false },
        { userId: 'co-author', isVisible: false },
        {
          userId: 'editor',
          role: 'EDITOR',
          isVisible: true,
          consentStatus: 'ACCEPTED',
        },
      ],
      'author-1'
    );

    expect(visibleArticleAttributions(result).map((entry) => entry.userId)).toEqual([
      'author-1',
      'editor',
    ]);
  });
});
