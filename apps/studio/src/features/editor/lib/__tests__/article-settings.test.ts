import { describe, it, expect } from 'vitest';
import {
  buildAttributionDrafts,
  buildArticleSettingsDraft,
  buildArticleSettingsSavePayload,
  parseFutureScheduleDraft,
  resolveArticleCategoryPath,
  computeAutoSeoDescription,
  articleSettingsFingerprint,
  type ArticleCategoryOption,
  type ArticleSettingsDraft,
} from '../article-settings';
import type { ArticleEditorPayload } from '@qoe/sdk/actions/articles';

describe('article-settings lib', () => {
  const mockAuthor = {
    id: 'user-primary-1',
    name: 'Alice Author',
    username: 'alice',
    logoUrl: 'https://cdn.qoe.fi/alice.webp',
    isCertified: true,
  };

  const mockCoAuthor = {
    id: 'user-co-2',
    name: 'Bob Coauthor',
    username: 'bob',
    logoUrl: null,
    isCertified: false,
  };

  describe('buildAttributionDrafts', () => {
    it('uses existing attributions if present', () => {
      const result = buildAttributionDrafts({
        author: mockAuthor,
        coAuthors: [mockCoAuthor],
        attributions: [
          {
            role: 'PHOTOGRAPHER',
            order: 5,
            isVisible: true,
            consentStatus: 'ACCEPTED',
            user: {
              id: 'user-photo',
              name: 'Photo Pro',
              username: 'photo',
              logoUrl: null,
              isCertified: false,
            },
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        userId: 'user-photo',
        name: 'Photo Pro',
        username: 'photo',
        logoUrl: null,
        isCertified: false,
        role: 'PHOTOGRAPHER',
        order: 5,
        isVisible: true,
        consentStatus: 'ACCEPTED',
      });
    });

    it('falls back to author and co-authors when no attributions exist', () => {
      const result = buildAttributionDrafts({
        author: mockAuthor,
        coAuthors: [mockCoAuthor, mockAuthor], // author duplicated in coAuthors must be filtered
        attributions: [],
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        userId: 'user-primary-1',
        name: 'Alice Author',
        username: 'alice',
        logoUrl: 'https://cdn.qoe.fi/alice.webp',
        isCertified: true,
        role: 'PRIMARY_AUTHOR',
        order: 0,
        isVisible: true,
      });
      expect(result[1]).toEqual({
        userId: 'user-co-2',
        name: 'Bob Coauthor',
        username: 'bob',
        logoUrl: null,
        isCertified: false,
        role: 'CO_AUTHOR',
        order: 1,
        isVisible: true,
        consentStatus: 'ACCEPTED',
      });
    });

    it('handles author only when coAuthors is undefined', () => {
      const result = buildAttributionDrafts({
        author: mockAuthor,
      });

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('PRIMARY_AUTHOR');
    });
  });

  describe('buildArticleSettingsDraft', () => {
    const basePayload: ArticleEditorPayload = {
      id: 'art-123',
      title: 'Mon bel article',
      content: '{"type":"doc","content":[]}',
      slug: 'mon-bel-article',
      published: false,
      status: 'DRAFT',
      imageUrl: 'https://cdn.qoe.fi/cover.webp',
      isPremium: true,
      categoryId: 'cat-tech',
      authorId: mockAuthor.id,
      author: mockAuthor,
      coAuthors: [],
      attributions: [],
      category: null,
      views: 120,
      viewsUnique: 90,
      commentsCount: 4,
      readingTime: 3,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
      publisherId: 'pub-direct-1',
      publisher: {
        id: 'pub-direct-1',
        name: 'Tech Revue',
        slug: 'tech-revue',
        type: 'MEDIA',
        subdomain: 'tech',
      },
      scheduledAt: '2026-12-01T10:00:00.000Z',
      seoTitle: 'Titre SEO',
      seoDescription: 'Description SEO personnalisée',
      allowPublicAnnotations: true,
      allowComments: false,
      allowDownload: true,
      showOnPersonalProfile: false,
    };

    it('maps payload into draft correctly', () => {
      const draft = buildArticleSettingsDraft(basePayload);

      expect(draft.id).toBe('art-123');
      expect(draft.title).toBe('Mon bel article');
      expect(draft.slug).toBe('mon-bel-article');
      expect(draft.isPremium).toBe(true);
      expect(draft.publisherName).toBe('Tech Revue');
      expect(draft.publisherSlug).toBe('tech-revue');
      expect(draft.subdomain).toBe('tech');
      expect(draft.seoTitle).toBe('Titre SEO');
      expect(draft.allowComments).toBe(false);
      expect(draft.showOnPersonalProfile).toBe(false);
      expect(draft.attributions).toHaveLength(1);
      expect(draft.attributions[0].userId).toBe('user-primary-1');
    });

    it('falls back to default status when status is omitted', () => {
      const draftPublished = buildArticleSettingsDraft({
        ...basePayload,
        status: '',
        published: true,
      });
      expect(draftPublished.status).toBe('PUBLISHED');

      const draftDraft = buildArticleSettingsDraft({
        ...basePayload,
        status: '',
        published: false,
      });
      expect(draftDraft.status).toBe('DRAFT');
    });

    it('falls back to publisherId when publisher object is missing', () => {
      const draft = buildArticleSettingsDraft({
        ...basePayload,
        publisher: undefined,
        publisherId: 'pub-orphan-99',
      });
      expect(draft.publisherId).toBe('pub-orphan-99');
      expect(draft.publisherName).toBeUndefined();
    });
  });

  describe('buildArticleSettingsSavePayload', () => {
    it('creates save payload and trims SEO fields', () => {
      const draft: ArticleSettingsDraft = {
        id: 'art-123',
        title: 'Titre',
        content: 'Contenu',
        imageUrl: null,
        slug: 'mon-slug',
        published: true,
        status: 'PUBLISHED',
        scheduledAt: null,
        scheduleDraft: '',
        isPremium: false,
        categoryId: 'cat-1',
        seoTitle: '   Titre SEO Trim   ',
        seoDescription: '   ',
        allowPublicAnnotations: true,
        allowComments: true,
        allowDownload: false,
        showOnPersonalProfile: true,
        publisherId: 'pub-1',
        attributions: [],
      };

      const payload = buildArticleSettingsSavePayload(draft);

      expect(payload.id).toBe('art-123');
      expect(payload.seoTitle).toBe('Titre SEO Trim');
      expect(payload.seoDescription).toBeNull(); // empty whitespace trimmed to null
      expect(payload.allowDownload).toBe(false);
      expect(payload.isPremium).toBe(false);
    });
  });

  describe('parseFutureScheduleDraft', () => {
    it('returns missing reason when empty', () => {
      expect(parseFutureScheduleDraft('')).toEqual({ date: null, reason: 'missing' });
      expect(parseFutureScheduleDraft('not-a-date')).toEqual({ date: null, reason: 'missing' });
    });

    it('returns past reason for a past date', () => {
      const res = parseFutureScheduleDraft('2020-01-01T12:00');
      expect(res.date).toBeNull();
      expect(res.reason).toBe('past');
    });

    it('returns valid date for a future date', () => {
      const futureYear = new Date().getFullYear() + 2;
      const res = parseFutureScheduleDraft(`${futureYear}-06-15T14:30`);
      expect(res.reason).toBeNull();
      expect(res.date).toBeInstanceOf(Date);
      expect(res.date?.getFullYear()).toBe(futureYear);
    });
  });

  describe('resolveArticleCategoryPath', () => {
    const categories: ArticleCategoryOption[] = [
      { id: 'cat-root', name: 'Technologie', slug: 'tech' },
      { id: 'cat-sub', name: 'Intelligence Artificielle', slug: 'ai', parentId: 'cat-root' },
      { id: 'cat-no-slug', name: 'Sans slug' },
    ];

    it('returns /uncategorized when categoryId is not found', () => {
      expect(resolveArticleCategoryPath(categories, 'cat-404')).toBe('/uncategorized');
      expect(resolveArticleCategoryPath(categories, null)).toBe('/uncategorized');
      expect(resolveArticleCategoryPath(categories, 'cat-no-slug')).toBe('/uncategorized');
    });

    it('resolves flat category path', () => {
      expect(resolveArticleCategoryPath(categories, 'cat-root')).toBe('/tech');
    });

    it('resolves nested category path with parent', () => {
      expect(resolveArticleCategoryPath(categories, 'cat-sub')).toBe('/tech/ai');
    });
  });

  describe('computeAutoSeoDescription', () => {
    it('generates excerpt from text content', () => {
      const content =
        'Ceci est un long paragraphe introductif qui explique en détail le sujet de notre publication.';
      const res = computeAutoSeoDescription(content, false);
      expect(res.length).toBeGreaterThan(0);
      expect(res).toContain('Ceci est un long paragraphe');
    });

    it('handles empty content gracefully', () => {
      expect(computeAutoSeoDescription('', false)).toBe('');
    });
  });

  describe('articleSettingsFingerprint', () => {
    const draft1: ArticleSettingsDraft = {
      id: 'art-1',
      title: 'T1',
      content: 'C1',
      imageUrl: null,
      slug: 'slug-1',
      published: false,
      status: 'DRAFT',
      scheduledAt: null,
      scheduleDraft: '',
      isPremium: false,
      categoryId: null,
      seoTitle: '',
      seoDescription: '',
      allowPublicAnnotations: true,
      allowComments: true,
      allowDownload: true,
      showOnPersonalProfile: true,
      publisherId: 'pub-1',
      attributions: [],
    };

    it('produces stable hash for same content and changes when modified', () => {
      const fp1 = articleSettingsFingerprint(draft1);
      const fp2 = articleSettingsFingerprint({ ...draft1 });
      expect(fp1).toBe(fp2);

      const fp3 = articleSettingsFingerprint({ ...draft1, title: 'Titre Modifié' });
      expect(fp3).not.toBe(fp1);

      const fp4 = articleSettingsFingerprint({ ...draft1, isPremium: true });
      expect(fp4).not.toBe(fp1);
    });
  });
});
