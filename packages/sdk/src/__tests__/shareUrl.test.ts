import { describe, expect, it } from 'vitest';
import { resolveArticleShareUrl, resolvePublisherOrigin } from '../lib/shareUrl';

// L06c : le partage d'article composait `https://{hôte}.qoe.fi`, ce qui donnait
// `https://exemple.com.qoe.fi` pour un domaine personnalisé, et figeait le
// domaine racine dans le code.

describe('resolvePublisherOrigin', () => {
  it('sert un domaine personnalisé tel quel', () => {
    expect(resolvePublisherOrigin({ customDomain: 'exemple.com' })).toBe('https://exemple.com');
  });

  it('préfixe un sous-domaine avec le domaine racine configurable', () => {
    expect(resolvePublisherOrigin({ subdomain: 'media' }, 'qoe.test')).toBe(
      'https://media.qoe.test'
    );
  });

  it('ne double pas un sous-domaine déjà qualifié', () => {
    expect(resolvePublisherOrigin({ subdomain: 'media.exemple.com' })).toBe(
      'https://media.exemple.com'
    );
  });

  it('retombe sur la racine pour une publication nue', () => {
    expect(resolvePublisherOrigin(null, 'qoe.test')).toBe('https://qoe.test');
  });
});

describe('resolveArticleShareUrl', () => {
  it('encode le slug et suit l’origine de la publication', () => {
    expect(
      resolveArticleShareUrl({ subdomain: 'media', customDomain: 'exemple.com' }, 'un slug/étrange')
    ).toBe('https://exemple.com/article/un%20slug%2F%C3%A9trange');
  });

  it('accepte une racine surchargée', () => {
    expect(resolveArticleShareUrl({ subdomain: 'media' }, 'intro', 'blogs.test')).toBe(
      'https://media.blogs.test/article/intro'
    );
  });
});
