import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mute: vi.fn(),
  block: vi.fn(),
  bookmark: vi.fn(),
}));

vi.mock('../actions/feed', () => ({
  toggleMuteUserAction: mocks.mute,
  toggleBlockUserAction: mocks.block,
  toggleBookmarkArticleHomeAction: mocks.bookmark,
}));

import {
  ENTITY_ACTIONS,
  executeDefaultEntityMutation,
  resolveEntityActions,
  type EntityActionContext,
} from '../entity-actions';
import { getActorShadow, getArticleShadow } from '../shadow';

const author = { id: 'author-1', username: 'jean' };

function thoughtCtx(overrides: Partial<EntityActionContext> = {}): EntityActionContext {
  return {
    entityType: 'thought',
    entityId: 'post-1',
    url: 'https://qoe.test/jean/thought/post-1',
    text: 'un texte',
    author,
    viewerId: 'viewer-1',
    ...overrides,
  };
}

const ids = (surface: Parameters<typeof resolveEntityActions>[0], ctx: EntityActionContext) =>
  resolveEntityActions(surface, ctx).map((a) => a.id);

describe('registre ENTITY_ACTIONS', () => {
  it('ne déclare aucun identifiant en double', () => {
    const seen = new Set(ENTITY_ACTIONS.map((a) => a.id));
    expect(seen.size).toBe(ENTITY_ACTIONS.length);
  });

  it('chaque action déclare au moins une surface', () => {
    expect(ENTITY_ACTIONS.every((a) => a.surfaces.length > 0)).toBe(true);
  });
});

describe('resolveEntityActions', () => {
  it('un visiteur ne reçoit aucune action exigeant une session', () => {
    const actions = ids('thought-card-menu', thoughtCtx({ viewerId: null }));
    expect(actions).toContain('copy-link');
    expect(actions).toContain('copy-text');
    expect(actions).not.toContain('toggle-mute-author');
    expect(actions).not.toContain('report');
  });

  it("l'auteur d'une pensée peut épingler et supprimer, pas se masquer", () => {
    const actions = ids('thought-card-menu', thoughtCtx({ viewerId: author.id }));
    expect(actions).toContain('toggle-pin');
    expect(actions).toContain('delete');
    expect(actions).not.toContain('toggle-mute-author');
    expect(actions).not.toContain('toggle-block-author');
    expect(actions).not.toContain('report');
  });

  it('un lecteur tiers peut masquer, bloquer et signaler', () => {
    const actions = ids('thought-card-menu', thoughtCtx());
    expect(actions).toContain('toggle-mute-author');
    expect(actions).toContain('toggle-block-author');
    expect(actions).toContain('report');
    expect(actions).not.toContain('delete');
    expect(actions).not.toContain('toggle-pin');
  });

  it('les capabilities du serveur priment sur le repli local', () => {
    const actions = ids(
      'thought-card-menu',
      thoughtCtx({ viewerId: author.id, capabilities: { canPin: false, canDelete: false } })
    );
    expect(actions).not.toContain('toggle-pin');
    expect(actions).not.toContain('delete');
  });

  it('canHideReply ouvre le masquage de réponse au seul auteur racine', () => {
    expect(ids('thought-card-menu', thoughtCtx())).not.toContain('toggle-hide-reply');
    expect(
      ids('thought-card-menu', thoughtCtx({ capabilities: { canHideReply: true } }))
    ).toContain('toggle-hide-reply');
  });

  it("le signet n'existe que sur une surface d'article", () => {
    const article: EntityActionContext = {
      entityType: 'article',
      entityId: 'artc_1',
      url: '/jean/a/slug',
      author,
      viewerId: 'viewer-1',
    };
    expect(ids('article-card-menu', article)).toContain('toggle-bookmark');
    expect(ids('thought-card-menu', thoughtCtx())).not.toContain('toggle-bookmark');
  });

  it('« copier le texte » disparaît sans texte', () => {
    expect(ids('thought-card-menu', thoughtCtx({ text: undefined }))).not.toContain('copy-text');
  });
});

describe('executeDefaultEntityMutation', () => {
  beforeEach(() => {
    mocks.mute.mockReset();
    mocks.block.mockReset();
    mocks.bookmark.mockReset();
  });

  it('met en sourdine de façon optimiste et persiste le résultat serveur', async () => {
    mocks.mute.mockResolvedValue({ ok: true, data: { muted: true } });
    await executeDefaultEntityMutation('toggle-mute-author', thoughtCtx());

    expect(mocks.mute).toHaveBeenCalledWith('author-1');
    expect(getActorShadow('author-1')?.muted).toBe(true);
  });

  it('rejoue la sourdine et restaure l’état en cas d’échec serveur', async () => {
    mocks.mute.mockResolvedValue({ ok: false, error: { message: 'refusé' } });
    await executeDefaultEntityMutation('toggle-mute-author', thoughtCtx({ author: { ...author } }));

    expect(mocks.mute).toHaveBeenCalledTimes(1);
    expect(getActorShadow('author-1')?.muted).toBe(false);
  });

  it('bloque de façon optimiste', async () => {
    mocks.block.mockResolvedValue({ ok: true, data: { blocked: true } });
    await executeDefaultEntityMutation('toggle-block-author', thoughtCtx());

    expect(mocks.block).toHaveBeenCalledWith('author-1');
    expect(getActorShadow('author-1')?.blocked).toBe(true);
  });

  it('met un article en signet via le shadow article', async () => {
    mocks.bookmark.mockResolvedValue({ ok: true, data: { bookmarked: true } });
    await executeDefaultEntityMutation('toggle-bookmark', {
      entityType: 'article',
      entityId: 'artc_9',
      author,
      viewerId: 'viewer-1',
    });

    expect(mocks.bookmark).toHaveBeenCalledWith('artc_9');
    expect(getArticleShadow('artc_9')?.bookmarked).toBe(true);
  });

  it('les actions sans défaut ne déclenchent aucune requête', async () => {
    await executeDefaultEntityMutation('delete', thoughtCtx());
    expect(mocks.mute).not.toHaveBeenCalled();
    expect(mocks.block).not.toHaveBeenCalled();
    expect(mocks.bookmark).not.toHaveBeenCalled();
  });
});
