import { describe, expect, it } from 'vitest';
import { ENTITY_ACTIONS, resolveEntityActions } from './entity-actions';

// 🔒 Registre figé : retirer une action, changer son identifiant ou les surfaces
// qui la proposent casse ce test. Le rendu du menu lui-même est couvert par
// `packages/ui/src/social/__tests__/EntityActionMenu.test.tsx`.
const EXPECTED_IDS = [
  'copy-text',
  'copy-link',
  'toggle-bookmark',
  'toggle-pin',
  'toggle-hide-reply',
  'show-less',
  'toggle-mute-author',
  'toggle-block-author',
  'report',
  'delete',
];

const EXPECTED_SURFACES: Record<string, string[]> = {
  'copy-text': ['thought-card-menu', 'cmdk-context'],
  'copy-link': [
    'thought-card-menu',
    'article-card-menu',
    'article-engagement-bar',
    'profile-menu',
    'cmdk-context',
  ],
  'toggle-bookmark': ['article-card-menu', 'cmdk-context'],
  'toggle-pin': ['thought-card-menu', 'cmdk-context'],
  'toggle-hide-reply': ['thought-card-menu'],
  'show-less': ['thought-card-menu', 'article-card-menu'],
  'toggle-mute-author': ['thought-card-menu', 'article-card-menu', 'profile-menu', 'cmdk-context'],
  'toggle-block-author': ['thought-card-menu', 'article-card-menu', 'profile-menu', 'cmdk-context'],
  report: ['thought-card-menu', 'article-card-menu', 'profile-menu'],
  delete: ['thought-card-menu'],
};

describe('registre entity-actions', () => {
  it('expose exactement les actions attendues, dans l’ordre', () => {
    expect(ENTITY_ACTIONS.map((action) => action.id)).toEqual(EXPECTED_IDS);
  });

  it('déclare les surfaces de chaque action', () => {
    for (const action of ENTITY_ACTIONS) {
      expect(action.surfaces).toEqual(EXPECTED_SURFACES[action.id]);
    }
  });

  it('résout un lecteur tiers vers les actions de modération, jamais la suppression', () => {
    const actions = resolveEntityActions('thought-card-menu', {
      entityType: 'thought',
      entityId: 'post-1',
      author: { id: 'a1', username: 'jean' },
      viewerId: 'viewer-1',
    });
    const ids = actions.map((action) => action.id);
    expect(ids).toContain('toggle-mute-author');
    expect(ids).toContain('report');
    expect(ids).not.toContain('delete');
    expect(ids).not.toContain('toggle-pin');
  });
});
