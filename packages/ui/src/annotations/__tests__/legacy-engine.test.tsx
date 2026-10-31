// @vitest-environment jsdom
// =====================================================================
// 🕰️ moteur hérité (sans document canonique) — ancrage par citation
// =====================================================================
// 📖 Avant `canonicalDocument`, le moteur peint en découpant les nœuds
//    texte de l'article déjà rendu. Il ne dispose que de deux informations :
//    le texte cité et son ORDINAL d'occurrence (`quoteOrdinal`).
//
// 🎯 Ce que ce fichier verrouille : l'ordinal compte pour TOUTES les
//    natures d'annotation. Il était transmis pour les surlignages privés et
//    oublié pour les publics — un passage répété (une formule reprise, un
//    titre cité) était donc peint sur sa première occurrence pendant que le
//    tiroir affichait la note de la seconde.
// =====================================================================

import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import { TextHighlighter } from '../TextHighlighter';
import type { AnnotationItem } from '../types';

const PASSAGE = 'La lenteur change la phrase';

/** Le passage est écrit DEUX fois : c'est tout l'intérêt du test. */
function mountArticle() {
  document.body.innerHTML = `<div id="article-content"><p>${PASSAGE}. Un paragraphe au milieu. ${PASSAGE}.</p></div>`;
}

function publicAnnotation(quoteOrdinal: number): AnnotationItem {
  return {
    id: 'pub-1',
    text: PASSAGE,
    quoteOrdinal,
    note: 'Note de la lectrice',
    isPublic: true,
    isOfficial: false,
    upvotesCount: 0,
    createdAt: '2026-09-04T18:40:00.000Z',
    reader: { id: 'reader-1', name: 'Camille', username: 'camille', logoUrl: null },
  };
}

function renderEngine(annotation: AnnotationItem) {
  return render(
    <TextHighlighter
      articleId="article-1"
      creatorName="Fay Moreau"
      allowPublicAnnotations
      isAuthenticated
      initialHighlights={[]}
      publicHighlights={[annotation]}
      mainAppUrl=""
      containerId="article-content"
    />
  );
}

const paintedMark = () =>
  document.getElementById('article-content')!.querySelector('mark[data-highlight-id="pub-1"]');

describe('moteur hérité — l’ordinal d’occurrence vaut pour toutes les natures', () => {
  beforeEach(() => {
    mountArticle();
  });

  it('peint le surlignage public sur la SECONDE occurrence quand l’ordinal vaut 1', () => {
    renderEngine(publicAnnotation(1));

    const mark = paintedMark();
    expect(mark).not.toBeNull();

    // Ce qui précède la marque contient déjà une occurrence entière du
    // passage : la marque est donc bien sur la deuxième.
    const before = mark!.previousSibling?.textContent ?? '';
    expect(before).toContain(`${PASSAGE}.`);
    expect(document.getElementById('article-content')!.textContent).toContain(
      `${PASSAGE}. Un paragraphe au milieu. ${PASSAGE}.`
    );
  });

  it('peint sur la première occurrence quand l’ordinal vaut 0', () => {
    renderEngine(publicAnnotation(0));

    const mark = paintedMark();
    expect(mark).not.toBeNull();
    // Rien avant la marque : elle commence le paragraphe.
    expect(mark!.previousSibling?.textContent ?? '').toBe('');
  });

  it('donne à la marque peinte un rôle et un accès clavier', () => {
    renderEngine(publicAnnotation(0));

    const mark = paintedMark();
    expect(mark!.getAttribute('role')).toBe('button');
    expect(mark!.getAttribute('tabindex')).toBe('0');
    expect(mark!.getAttribute('aria-label')).toContain('Annotation publique');
  });

  it('ne peint pas deux fois le même identifiant si la liste le contient en double', () => {
    render(
      <TextHighlighter
        articleId="article-1"
        creatorName="Fay Moreau"
        allowPublicAnnotations
        isAuthenticated
        initialHighlights={[]}
        publicHighlights={[publicAnnotation(0), publicAnnotation(0)]}
        mainAppUrl=""
        containerId="article-content"
      />
    );

    expect(document.querySelectorAll('mark[data-highlight-id="pub-1"]')).toHaveLength(1);
  });
});
