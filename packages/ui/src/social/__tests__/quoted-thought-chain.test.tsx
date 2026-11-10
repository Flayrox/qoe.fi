import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThoughtCard, type ThoughtData } from '../ThoughtCard';
import { QuotedThoughtCard, type QuotedThoughtData } from '../QuotedThoughtCard';
import type { QuotedArticleData } from '../QuotedArticleCard';

const MEDIA = {
  id: 'author-media',
  name: 'Le Journal Éco',
  username: 'journaleco',
  subdomain: 'journaleco',
  logoUrl: null,
  isCertified: true,
  type: 'MEDIA' as const,
};

const PERSON = {
  id: 'author-person',
  name: 'Camille Roux',
  username: 'camille',
  subdomain: null,
  logoUrl: null,
  isCertified: false,
  type: 'PERSONAL' as const,
};

const ARTICLE: QuotedArticleData = {
  id: 'article-1',
  title: 'La ville sans voiture',
  slug: 'la-ville-sans-voiture',
  quoteContext: {
    before: 'Les chiffres disent l’inverse : ',
    highlight: 'les commerces de proximité augmentent',
    after: ', et le temps de trajet ne bouge pas.',
    start: 20,
    end: 60,
    sha: 'sha-1',
  },
  author: { name: 'Camille Roux', username: 'camille', subdomain: null },
  publisher: { name: 'Le Journal Éco', subdomain: 'journaleco', customDomain: null },
};

/** Maillon 3 : une pensée qui cite un article. */
const DEEPEST: QuotedThoughtData = {
  id: 'thought-deepest',
  content: 'Une mémoire sans oubli est une prison.',
  createdAt: '2026-10-27T18:03:00.000Z',
  author: MEDIA,
  articleQuote: ARTICLE,
  quotedExcerpt: 'les commerces de proximité augmentent',
};

/** Maillon 2 : cite la pensée qui cite l'article. */
const MIDDLE: QuotedThoughtData = {
  id: 'thought-middle',
  content: 'Je cite une citation, et c’est déjà un troisième point de vue.',
  createdAt: '2026-10-28T10:00:00.000Z',
  author: PERSON,
  repost: DEEPEST,
};

/** Maillon 1 : la citation directe. */
const FIRST: QuotedThoughtData = {
  id: 'thought-first',
  content: 'La chaîne commence ici.',
  createdAt: '2026-10-29T10:00:00.000Z',
  author: PERSON,
  repost: MIDDLE,
};

function postWithQuote(repost: QuotedThoughtData | null): ThoughtData {
  return {
    id: 'thought-outer',
    content: 'Trois lectures d’un même passage. La troisième est la mienne.',
    createdAt: '2026-10-29T11:00:00.000Z',
    author: PERSON,
    repost,
  };
}

describe('QuotedThoughtCard — chaîne de citations', () => {
  it('dessine les trois maillons et l’article cité au fond', () => {
    const html = renderToStaticMarkup(<ThoughtCard post={postWithQuote(FIRST)} />);

    expect(html).toContain('La chaîne commence ici.');
    expect(html).toContain('Je cite une citation, et c’est déjà un troisième point de vue.');
    expect(html).toContain('Une mémoire sans oubli est une prison.');
    expect(html).toContain('La ville sans voiture');
    expect(html).toContain('les commerces de proximité augmentent');

    // Trois niveaux distincts, pas une seule boîte aplatie.
    expect(html).toContain('data-quote-depth="0"');
    expect(html).toContain('data-quote-depth="1"');
    expect(html).toContain('data-quote-depth="2"');
  });

  it('résume au-delà de trois maillons au lieu d’indenter à l’infini', () => {
    const fourth: QuotedThoughtData = {
      id: 'thought-fourth',
      content: 'Quatrième maillon, volontairement hors du rendu.',
      createdAt: '2026-10-27T08:00:00.000Z',
      author: PERSON,
    };
    const html = renderToStaticMarkup(
      <ThoughtCard
        post={postWithQuote({
          ...FIRST,
          repost: { ...MIDDLE, repost: { ...DEEPEST, repost: fourth } },
        })}
      />
    );

    expect(html).not.toContain('Quatrième maillon');
    expect(html).toContain('La chaîne de citations continue.');
  });

  it('garde un repli explicite quand un maillon n’a plus de contenu', () => {
    const html = renderToStaticMarkup(
      <QuotedThoughtCard
        post={{
          id: 'thought-ghost',
          content: '   ',
          author: { id: 'ghost', name: null, username: null, logoUrl: null },
          repost: null,
        }}
      />
    );

    expect(html).toContain('data-quote-missing');
    expect(html).toContain('Le texte cité n’est plus disponible.');
    // L’identité survit à la disparition du texte, sans afficher d’UUID.
    expect(html).toContain('>Auteur<');
    expect(html).not.toContain('@ghost');
  });

  it('rend l’écho d’une citation avec le maillon qu’il remonte', () => {
    const echo: ThoughtData = {
      id: 'thought-echo',
      content: '',
      createdAt: '2026-10-30T09:00:00.000Z',
      author: PERSON,
      repost: FIRST,
    };
    const html = renderToStaticMarkup(<ThoughtCard post={echo} />);

    expect(html).toContain('La chaîne commence ici.');
    expect(html).toContain('Je cite une citation');
    expect(html).toContain('Une mémoire sans oubli est une prison.');
  });

  it('réutilise l’avatar du contrat : média carré, personne ronde', () => {
    const html = renderToStaticMarkup(<QuotedThoughtCard post={DEEPEST} />);

    expect(html).toContain('data-account-type="MEDIA"');
    expect(html).toContain('data-avatar-shape="square"');
  });

  it('n’expose qu’un seul bouton dans la chaîne, et il est au clavier', () => {
    const html = renderToStaticMarkup(<QuotedThoughtCard post={FIRST} />);

    // Un seul maillon interactif : le premier. Les suivants sont du contexte.
    expect((html.match(/role="button"/g) ?? []).length).toBe(1);
    expect(html).toContain('tabindex="0"');
  });

  it('affiche les images des pensées citées (imageUrl et grille attachments) et les préserve dans un écho', () => {
    const quotedWithGrid: QuotedThoughtData = {
      id: 'thought-grid',
      content: 'Planches de terrain',
      author: MEDIA,
      attachments: [
        { id: '1', url: '/lab/editorial-city.svg', type: 'IMAGE', altText: 'Planche 1' },
        { id: '2', url: '/lab/editorial-transit.svg', type: 'IMAGE', altText: 'Planche 2' },
      ],
    };

    const quoteHtml = renderToStaticMarkup(<ThoughtCard post={postWithQuote(quotedWithGrid)} />);
    expect(quoteHtml).toContain('data-quoted-media');
    expect(quoteHtml).toContain('/lab/editorial-city.svg');
    expect(quoteHtml).toContain('/lab/editorial-transit.svg');

    // Un maillon contenant uniquement une image ne doit jamais être marqué manquant.
    const imageOnlyHtml = renderToStaticMarkup(
      <QuotedThoughtCard
        post={{
          id: 'thought-img-only',
          content: '',
          imageUrl: '/lab/editorial-archive.svg',
          author: PERSON,
        }}
      />
    );
    expect(imageOnlyHtml).not.toContain('data-quote-missing');
    expect(imageOnlyHtml).toContain('/lab/editorial-archive.svg');

    // Un écho pur d'une pensée illustrée conserve ses pièces jointes et affiche la bannière.
    const echoWithAttachments: ThoughtData = {
      id: 'echo-att',
      content: '',
      createdAt: '2026-10-30T10:00:00.000Z',
      author: PERSON,
      repost: {
        id: 'orig-att',
        content: 'Archive numérisée',
        author: MEDIA,
        attachments: [
          { id: 'a1', url: '/lab/editorial-archive.svg', type: 'IMAGE', altText: 'Archive' },
        ],
      },
    };
    const echoHtml = renderToStaticMarkup(<ThoughtCard post={echoWithAttachments} />);
    expect(echoHtml).toContain('data-repost-banner');
    expect(echoHtml).toContain('@camille');
    expect(echoHtml).toContain('/lab/editorial-archive.svg');
  });
});
