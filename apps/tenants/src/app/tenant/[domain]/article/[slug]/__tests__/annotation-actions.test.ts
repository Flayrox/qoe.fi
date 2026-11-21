// @vitest-environment jsdom
// =====================================================================
// 🧪 Annotations tenants — le contrat `{ok}` de createAnnotationCallbacks
// =====================================================================
// `TenantArticleHighlighter` passe ces server actions à
// `createAnnotationCallbacks`, qui attend des fonctions à **argument objet**
// rendant `{ ok, data, error }`.
// Les wrappers locaux faisaient l'inverse : signatures positionnelles,
// réécriture en `{ success }` et `throw` sur refus. Résultat mesuré ici :
// création de surlignage avec un objet à la place de l'identifiant, commentaire
// d'annotation annoncé en échec alors qu'il a réussi, suppression annoncée en
// succès alors que le serveur l'a refusée.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  const ok = (data: unknown = {}) => vi.fn(async () => ({ ok: true, data }));
  return {
    createHighlightAction: ok({ highlight: { id: 'h1' } }),
    upvoteHighlightAction: ok(),
    createAnnotationCommentAction: ok({ comment: { id: 'c1' } }),
    toggleHighlightPrivacyAction: ok({ highlight: { id: 'h1' } }),
    updateHighlightNoteAction: ok(),
    deleteHighlightAction: vi.fn(async () => ({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Refusé' },
    })),
    quotePassageToFeedAction: ok({ post: { id: 'p1' } }),
    citeAnnotationAction: ok(),
  };
});

vi.mock('@qoe/sdk/actions/tenant', () => sdk);
vi.mock('@qoe/sdk/actions/articles', () => ({
  postArticleCommentAction: vi.fn(),
  deleteArticleCommentAction: vi.fn(),
  getArticleCommentsAction: vi.fn(async () => ({ ok: true, data: [] })),
}));

import { createAnnotationCallbacks } from '@qoe/ui/annotations/callbacks';
import * as tenantActions from '../actions';

function callbacks() {
  return createAnnotationCallbacks('art_1', {
    createHighlightAction: tenantActions.createHighlightAction as never,
    upvoteHighlightAction: tenantActions.upvoteHighlightAction as never,
    createAnnotationCommentAction: tenantActions.createAnnotationCommentAction as never,
    toggleHighlightPrivacyAction: tenantActions.toggleHighlightPrivacyAction as never,
    updateHighlightNoteAction: tenantActions.updateHighlightNoteAction as never,
    deleteHighlightAction: tenantActions.deleteHighlightAction as never,
    quotePassageToFeedAction: tenantActions.quotePassageToFeedAction as never,
  });
}

describe('annotations tenants — contrat des callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crée un surlignage avec l’identifiant de l’article, pas avec l’objet entier', async () => {
    await callbacks().onHighlightCreate?.({ text: 'passage', isPublic: false } as never);

    expect(sdk.createHighlightAction).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 'art_1', text: 'passage' })
    );
  });

  it('annonce un commentaire d’annotation réussi quand le serveur l’accepte', async () => {
    const res = await callbacks().onComment?.({ highlightId: 'h1', content: 'merci' } as never);

    expect(res).toMatchObject({ ok: true });
  });

  it('annonce la suppression en échec quand le serveur la refuse', async () => {
    const res = await callbacks().onDelete?.('h1');

    expect(res).toMatchObject({ ok: false });
  });
});
