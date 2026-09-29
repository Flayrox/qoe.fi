import { describe, it, expect } from 'vitest';
import { homeDataFromGo } from './home-feed-data';

// Transparence du suivi (fiche 06 §9) : le front relaie tel quel la liste
// des auteurs masqués fournie par Go — jamais de filtrage silencieux côté
// client non plus.

const emptyBundle = {
  followedCreators: [],
  followedUserIds: [],
  following: { articles: [], thoughts: [] },
  discover: { articles: [], thoughts: [] },
  recommended: { articles: [], thoughts: [] },
  bookmarks: [],
  highlightsCount: 0,
  activityData: [],
  mutedWords: [],
  featuredArticle: null,
  followingHidden: [],
};

describe('homeDataFromGo — auteurs masqués', () => {
  it('relaye la liste telle quelle (motif + échéance)', () => {
    const home = homeDataFromGo({
      ...emptyBundle,
      followingHidden: [
        { authorId: 'a1', reason: 'restricted', until: '2026-09-30T07:00:00Z' },
        { authorId: 'a2', reason: 'suspended', until: null },
      ],
    });
    expect(home.followingHidden).toEqual([
      { authorId: 'a1', reason: 'restricted', until: '2026-09-30T07:00:00Z' },
      { authorId: 'a2', reason: 'suspended', until: null },
    ]);
  });

  it('absent ou null → tableau vide (contrat jamais-null)', () => {
    expect(homeDataFromGo(emptyBundle).followingHidden).toEqual([]);
    expect(
      homeDataFromGo({ ...emptyBundle, followingHidden: null as unknown as [] }).followingHidden
    ).toEqual([]);
  });
});
