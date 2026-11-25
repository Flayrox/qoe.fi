import { describe, expect, it } from 'vitest';
import { mapSliceToFeedItem } from '../actions/feed/mappers';

const author = (id: string) => ({ id, name: id, username: id, logoUrl: null, isCertified: false });

function slice(target: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: String(target.id ?? 'slice'),
    rootPost: null,
    parentPost: null,
    targetPost: { author: author('u1'), content: '', createdAt: '2026-01-01T00:00:00Z', ...target },
    isIncompleteThread: false,
    hiddenIntermediateCount: 0,
    ...extra,
  } as never;
}

describe('mapSliceToFeedItem', () => {
  it('projette un post isolé et son why', () => {
    const item = mapSliceToFeedItem(slice({ id: 'p1', content: 'hola', why: 'parce que' }));
    expect(item.post.id).toBe('p1');
    expect(item.reply).toBeUndefined();
    expect(item.reason).toBeUndefined();
    expect(item.why).toBe('parce que');
  });

  it('porte le contexte de réponse et le grand-parent', () => {
    const root = { id: 'root', author: author('u-root') };
    const parent = { id: 'parent', author: author('u-parent'), parent: root };
    const item = mapSliceToFeedItem(slice({ id: 'child' }, { rootPost: root, parentPost: parent }));
    expect(item.reply?.root?.id).toBe('root');
    expect(item.reply?.parent?.id).toBe('parent');
    expect(item.reply?.grandparentAuthor?.id).toBe('u-root');
  });

  it('porte l’article commenté sans le confondre avec une racine de pensée', () => {
    const article = { id: 'art1', title: 'Titre', slug: 'titre' };
    const item = mapSliceToFeedItem(slice({ id: 'c1', rootArticle: article }));
    expect(item.reply?.article?.id).toBe('art1');
    expect(item.reply?.root).toBeNull();
  });

  it('affiche le post d’origine pour un repost pur', () => {
    const item = mapSliceToFeedItem(
      slice({ id: 'r1', content: '  ', repost: { id: 'orig' }, author: author('u-repost') })
    );
    expect(item.post.id).toBe('orig');
    expect(item.reason).toMatchObject({ type: 'repost', by: { id: 'u-repost' } });
  });

  it('ne transforme pas une citation avec texte en repost', () => {
    const item = mapSliceToFeedItem(
      slice({ id: 'q1', content: 'mon commentaire', repost: { id: 'orig' } })
    );
    expect(item.post.id).toBe('q1');
    expect(item.reason).toBeUndefined();
  });

  it('marque un repost d’article', () => {
    const item = mapSliceToFeedItem(
      slice({ id: 'a1', content: '', quotedArticle: { id: 'art1' } })
    );
    expect(item.post.id).toBe('a1');
    expect(item.reason?.type).toBe('article_repost');
  });

  it('marque une épingle', () => {
    const item = mapSliceToFeedItem(slice({ id: 'p1', isPinned: true }));
    expect(item.reason?.type).toBe('pin');
  });
});
