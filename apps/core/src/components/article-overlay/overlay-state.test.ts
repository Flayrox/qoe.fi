import { describe, expect, it } from 'vitest';

import {
  HISTORY_KEY,
  buildArticleUrl,
  buildPlaceholder,
  isOverlayState,
  readCachedArticle,
  rememberArticle,
} from './overlay-state';

// =====================================================================
// 🧪 La logique pure de la surcouche d'article
// =====================================================================
// Ce qui est vérifié ici est exactement ce qui décide, au clic, quelle URL
// est poussée dans l'historique et ce qui s'affiche avant la réponse réseau.
// La mécanique DOM (focus, scroll, popstate) vit dans le provider, testé en
// environnement `node` il ne peut pas être monté — voir la note du
// vitest.config de apps/core.
// =====================================================================

describe('isOverlayState', () => {
  it('reconnaît une entrée de surcouche', () => {
    expect(isOverlayState({ [HISTORY_KEY]: true, slug: 'mon-article' })).toBe(true);
  });

  it('refuse les états qui ne sont pas les nôtres', () => {
    expect(isOverlayState(null)).toBe(false);
    expect(isOverlayState(undefined)).toBe(false);
    expect(isOverlayState({})).toBe(false);
    // Le feed pousse son propre état pour les pensées : il ne doit jamais
    // être confondu avec une surcouche d'article, sinon la fermeture
    // dépilerait l'historique au mauvais moment.
    expect(isOverlayState({ postId: 'p1', scroll: 240 })).toBe(false);
    expect(isOverlayState({ [HISTORY_KEY]: true })).toBe(false);
    expect(isOverlayState({ [HISTORY_KEY]: false, slug: 'x' })).toBe(false);
  });
});

describe('buildArticleUrl', () => {
  it('reste sur l’origine de l’app, jamais sur le domaine du média', () => {
    const url = buildArticleUrl(
      {
        slug: 'la-ville-sans-voiture',
        publication: { slug: 'le-media', subdomain: 'le-media', customDomain: 'le-media.fr' },
        author: { id: 'a1', username: 'camille' },
      },
      'la-ville-sans-voiture'
    );

    expect(url).toBe('/le-media/la-ville-sans-voiture');
    expect(url.startsWith('https://')).toBe(false);
  });

  it('retombe sur le créateur quand il n’y a pas de média', () => {
    const url = buildArticleUrl(
      { slug: 'billet', author: { id: 'a1', username: 'ephe' } },
      'billet'
    );
    expect(url).toBe('/ephe/billet');
  });
});

describe('buildPlaceholder', () => {
  it('garde ce que la carte sait déjà', () => {
    const placeholder = buildPlaceholder({
      slug: 'un-article',
      id: 'art-1',
      title: 'Un article',
      createdAt: '2026-10-01T10:00:00.000Z',
      readingTime: 7,
      author: { id: 'a1', name: 'Camille', username: 'camille' },
    });

    expect(placeholder.id).toBe('art-1');
    expect(placeholder.title).toBe('Un article');
    expect(placeholder.slug).toBe('un-article');
    expect(placeholder.readingTime).toBe(7);
    expect(placeholder.author.name).toBe('Camille');
    expect(placeholder.isLoading).toBe(true);
  });

  it('produit une coquille valide quand on n’a que le slug', () => {
    const placeholder = buildPlaceholder({ slug: 'seulement-le-slug' });

    expect(placeholder.id).toBe('seulement-le-slug');
    expect(placeholder.title).toBe('');
    expect(placeholder.content).toBe('');
    expect(placeholder.readingTime).toBe(3);
    // Un auteur fantôme plutôt qu'une carte qui plante sur `author.id`.
    expect(placeholder.author.id).toBe('loading');
    expect(placeholder.publication).toBeNull();
  });

  it('accepte un contenu null venu des cartes du feed', () => {
    const placeholder = buildPlaceholder({ slug: 'x', content: null });
    expect(placeholder.content).toBe('');
  });
});

describe('cache du thread', () => {
  it('sert le contenu préchargé au moment du clic', () => {
    const article = buildPlaceholder({ slug: 'precharge', title: 'Déjà là' });
    rememberArticle('precharge', article, 1_000);

    expect(readCachedArticle('precharge', 1_500)).toBe(article);
  });

  it('oublie une entrée plus vieille que la TTL', () => {
    rememberArticle('perime', buildPlaceholder({ slug: 'perime' }), 0);

    // 61 s : au-delà de la minute de fraîcheur, on refetch.
    expect(readCachedArticle('perime', 61_000)).toBeNull();
  });

  it('ne connaît pas un article jamais préchargé', () => {
    expect(readCachedArticle('inconnu', 0)).toBeNull();
  });
});
