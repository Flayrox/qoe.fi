import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThoughtCard, type ThoughtData } from '../ThoughtCard';

/**
 * Une citation d'annotation peut n'avoir AUCUN mot ajouté : la note citée
 * est le contenu. Elle ne doit donc pas être prise pour un repartage
 * d'article (« a repartagé »), ni perdre son attribution.
 */
const citationPost: ThoughtData = {
  id: 'post_cite',
  content: '',
  createdAt: '2026-10-22T00:00:00Z',
  author: {
    id: 'user_lila',
    name: 'Lila',
    username: 'lila',
    logoUrl: null,
    isCertified: false,
  },
  articleQuote: {
    id: 'art_1',
    title: 'La lenteur comme méthode',
    slug: 'la-lenteur-comme-methode',
    quoteContext: {
      before: 'Puis ',
      highlight: 'ce qu’il relirait deux fois',
      after: ' devient une contrainte tenable.',
      start: 420,
      end: 450,
      sha: 'sha-1',
    },
    author: { name: 'Fay Moreau', username: 'fay', subdomain: 'la-lenteur' },
    publication: { name: 'La Lenteur', subdomain: 'la-lenteur', customDomain: null },
  },
  quotedExcerpt: 'ce qu’il relirait deux fois',
  annotationQuote: {
    id: 'hl-1',
    note: 'Ici la formule revient comme une conclusion.',
    excerpt: 'ce qu’il relirait deux fois',
    quoteOrdinal: 1,
    canonicalStart: 420,
    canonicalEnd: 450,
    contentSha: 'sha-1',
    reader: { id: 'reader-2', name: 'Camille', username: 'camille', logoUrl: null },
  },
};

describe('ThoughtCard — citation d’annotation', () => {
  it('affiche la note, son auteur et le passage — sans bannière de repartage', () => {
    const html = renderToStaticMarkup(
      <ThoughtCard post={citationPost} currentUserId="user_lila" />
    );

    expect(html).toContain('Annotation de Camille');
    expect(html).toContain('Ici la formule revient comme une conclusion.');
    expect(html).toContain('ce qu’il relirait deux fois');
    expect(html).toContain('La lenteur comme méthode');
    expect(html).toContain('data-quoted-annotation="hl-1"');
    // Une citation n'est pas un repartage d'article.
    expect(html).not.toContain('a repartagé');
  });

  it('garde le mot ajouté au-dessus de la citation', () => {
    const html = renderToStaticMarkup(
      <ThoughtCard
        post={{ ...citationPost, content: 'À lire avec la note de Camille.' }}
        currentUserId="user_lila"
      />
    );

    expect(html).toContain('À lire avec la note de Camille.');
    expect(html).toContain('Annotation de Camille');
  });

  it('dérive la forme des deux identités média depuis leurs données', () => {
    const mediaCitation = citationPost.annotationQuote!;
    const html = renderToStaticMarkup(
      <ThoughtCard
        post={{
          ...citationPost,
          author: { ...citationPost.author, type: 'MEDIA' },
          annotationQuote: {
            ...mediaCitation,
            reader: { ...mediaCitation.reader, type: 'MEDIA' },
          },
        }}
        currentUserId="user_lila"
      />
    );

    // L'auteur de la pensée et l'auteur de l'annotation citée sont deux
    // comptes média : leurs deux avatars passent par SafeAvatar en carré.
    expect((html.match(/data-account-type="MEDIA"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((html.match(/data-avatar-shape="square"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('affiche la citation dégradée sans être vide quand content est vide et articleQuote est null', () => {
    const postWithDeletedArticle: ThoughtData = {
      ...citationPost,
      content: '',
      articleQuote: null,
    };
    const html = renderToStaticMarkup(
      <ThoughtCard post={postWithDeletedArticle} currentUserId="user_lila" />
    );

    expect(html).toContain('Annotation de Camille');
    expect(html).toContain('Ici la formule revient comme une conclusion.');
    expect(html).toContain('ce qu’il relirait deux fois');
    expect(html).toContain('Article indisponible');
    expect(html).toContain('data-quoted-annotation="hl-1"');
    expect(html).not.toContain('La lenteur comme méthode');
  });
});
