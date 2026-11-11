// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CanonicalArticleBody } from '../CanonicalArticleBody';
import { buildSegmentMarks } from '../CanonicalArticleBody';
import { type CanonicalDocument, type PaintMark } from '../canonical-document';
import type { AnnotationItem, HighlightItem } from '../types';

// Fixture alignée sur le corpus Go :
// <p>Bonjour <strong>le monde</strong> !</p><p>Deuxième partie ici</p>
const doc: CanonicalDocument = {
  blocks: [
    {
      kind: 'p',
      text: 'Bonjour le monde !',
      inline: [{ start: 8, end: 16, style: 'bold' }],
      spans: [{ start: 0, end: 7, note: 'Note officielle du créateur' }],
    },
    { kind: 'p', text: 'Deuxième partie ici' },
  ],
  segments: [
    { blockIdx: 0, itemIdx: 0, text: 'Bonjour le monde !', start: 0, end: 18 },
    { blockIdx: 1, itemIdx: 0, text: 'Deuxième partie ici', start: 19, end: 37 },
  ],
  text: 'Bonjour le monde ! Deuxième partie ici',
  sha: 'sha-1',
};

const officialFromServer: AnnotationItem = {
  id: 'official-1',
  text: 'Bonjour',
  note: 'Note officielle du créateur',
  isPublic: true,
  isOfficial: true,
  upvotesCount: 3,
  createdAt: new Date().toISOString(),
  reader: { id: 'creator', name: 'Créatrice', username: 'creator', logoUrl: null },
};

const publicHighlight: AnnotationItem = {
  id: 'pub-1',
  text: 'monde',
  canonicalStart: 11,
  canonicalEnd: 16,
  contentSha: 'sha-1',
  note: 'Très juste',
  isPublic: true,
  isOfficial: false,
  upvotesCount: 0,
  createdAt: new Date().toISOString(),
  reader: { id: 'r1', name: 'Lectrice', username: 'lectrice', logoUrl: null },
};

const privateHighlight: HighlightItem = {
  id: 'priv-1',
  text: 'Deuxième',
  canonicalStart: 19,
  canonicalEnd: 27,
  contentSha: 'sha-1',
  note: 'À relire',
  isPublic: false,
  isOfficial: false,
};

const staleHighlight: HighlightItem = {
  id: 'stale-1',
  text: 'partie',
  canonicalStart: 28,
  canonicalEnd: 34,
  contentSha: 'sha-ancien', // contenu édité depuis → ne pas peindre
  note: null,
  isPublic: false,
  isOfficial: false,
};

const noAnchorsHighlight: HighlightItem = {
  id: 'no-anchor-1',
  text: 'ici',
  note: null,
  isPublic: false,
  isOfficial: false,
};

function renderBody(
  highlights: HighlightItem[],
  allPublic: AnnotationItem[],
  filterMode: 'all' | 'official' | 'none'
) {
  return renderToStaticMarkup(
    <CanonicalArticleBody
      document={doc}
      highlights={highlights}
      allPublic={allPublic}
      filterMode={filterMode}
      containerId="article-content"
      creatorName="Créatrice"
      onMarkClick={() => {}}
    />
  );
}

describe('CanonicalArticleBody — marques par offsets', () => {
  it('peint le span officiel du document à la bonne position', () => {
    const html = renderBody([], [officialFromServer], 'all');
    expect(html).toContain('data-highlight-id="official-1"');
    expect(html).toContain('data-highlight-text="Bonjour"');
    // Le span officiel recouvre [0,7) ; « le monde » (bold [8,16)) n'est pas marqué.
    expect(html).toContain('<strong>le monde</strong>');
  });

  it('peint un surlignage public par offsets, imbriqué dans le style inline', () => {
    const html = renderBody([], [officialFromServer, publicHighlight], 'all');
    // « monde » = [11,16) est dans le bold [8,16) ET dans la marque publique.
    expect(html).toContain('data-highlight-id="pub-1"');
    expect(html).toContain('data-highlight-text="monde"');
    const monde = html.match(/<mark[^>]*data-highlight-id="pub-1"[^>]*>(.*?)<\/mark>/);
    expect(monde).not.toBeNull();
    expect(monde![1]).toContain('<strong>monde</strong>');
  });

  it('peint un surlignage privé multi-bloc (bornes globales → locale)', () => {
    const html = renderBody([privateHighlight], [], 'all');
    expect(html).toContain('data-highlight-id="priv-1"');
    expect(html).toContain('data-highlight-text="Deuxième"');
  });

  it('ne peint pas deux fois la même annotation (liste reçue en double)', () => {
    // Le parent et le moteur peuvent ajouter la même annotation à tour de
    // rôle : deux `<mark>` imbriqués portant le même id, mêmes classes, et
    // le trait qui double sans rien signaler d'autre.
    const html = renderBody([privateHighlight, { ...privateHighlight }], [], 'all');
    expect(html.match(/data-highlight-id="priv-1"/g) ?? []).toHaveLength(1);
  });

  it('ignore les ancres périmées (sha différent) et sans offsets', () => {
    const html = renderBody([privateHighlight, staleHighlight, noAnchorsHighlight], [], 'all');
    expect(html).not.toContain('stale-1');
    expect(html).not.toContain('no-anchor-1');
    expect(html).toContain('priv-1');
  });

  it('synthétise un span officiel sans allPublic correspondant', () => {
    const html = renderBody([], [], 'all');
    // « Bonjour » [0,7) : aucun allPublic → id synthétique + title note.
    expect(html).toContain('data-highlight-id="official-html-mark-0-0"');
    expect(html).toContain('title="Annotation officielle : Note officielle du créateur"');
  });

  it('réutilise l’allPublic officiel plutôt que synthétiser', () => {
    const html = renderBody([], [officialFromServer], 'all');
    expect(html).toContain('data-highlight-id="official-1"');
    expect(html).not.toContain('official-html-mark-');
  });

  it('respecte filterMode=none (aucune marque)', () => {
    const html = renderBody([privateHighlight], [officialFromServer, publicHighlight], 'none');
    expect(html).not.toContain('<mark');
    expect(html).toContain('<p>Bonjour <strong>le monde</strong> !</p>');
  });

  it('respecte filterMode=official (privé masqué, officiel visible)', () => {
    const html = renderBody([privateHighlight], [officialFromServer, publicHighlight], 'official');
    expect(html).not.toContain('priv-1');
    expect(html).not.toContain('pub-1');
    expect(html).toContain('official-1');
  });

  it('rend les liens inline avec href', () => {
    const docLink: CanonicalDocument = {
      blocks: [
        {
          kind: 'p',
          text: 'Voir la source',
          inline: [{ start: 5, end: 15, style: 'link', href: 'https://qoe.fi' }],
        },
      ],
      segments: [{ blockIdx: 0, itemIdx: 0, text: 'Voir la source', start: 0, end: 14 }],
      text: 'Voir la source',
      sha: 'sha-l',
    };
    const html = renderToStaticMarkup(
      <CanonicalArticleBody
        document={docLink}
        highlights={[]}
        allPublic={[]}
        filterMode="all"
        creatorName="Créatrice"
        onMarkClick={() => {}}
      />
    );
    expect(html).toContain('<a href="https://qoe.fi"');
    expect(html).toContain('>la source</a>');
  });

  it('rend une liste ordonnée avec marques par item', () => {
    const docList: CanonicalDocument = {
      blocks: [
        {
          kind: 'list',
          ordered: true,
          items: [{ text: 'Premier' }, { text: 'Second point' }],
        },
      ],
      segments: [
        { blockIdx: 0, itemIdx: 0, text: 'Premier', start: 0, end: 7 },
        { blockIdx: 0, itemIdx: 1, text: 'Second point', start: 8, end: 20 },
      ],
      text: 'Premier Second point',
      sha: 'sha-l',
    };
    const hl: HighlightItem = {
      id: 'item-hl',
      text: 'Second point',
      canonicalStart: 8,
      canonicalEnd: 20,
      contentSha: 'sha-l',
      note: null,
      isPublic: false,
      isOfficial: false,
    };
    const html = renderToStaticMarkup(
      <CanonicalArticleBody
        document={docList}
        highlights={[hl]}
        allPublic={[]}
        filterMode="all"
        creatorName="Créatrice"
        onMarkClick={() => {}}
      />
    );
    expect(html).toContain('<ol');
    expect(html).toContain('<li>Premier</li>');
    expect(html).toContain('<li><mark');
    expect(html).toContain('data-highlight-id="item-hl"');
    expect(html).toContain('data-highlight-text="Second point"');
  });
});

describe('CanonicalArticleBody — quatre états de lecture', () => {
  const markTag = (html: string, id: string) =>
    html.match(new RegExp(`<mark[^>]*data-highlight-id="${id}"[^>]*>`))?.[0] ?? '';

  it('donne une peau distincte à l’annotation privée, publique et officielle', () => {
    const html = renderBody([privateHighlight], [publicHighlight, officialFromServer], 'all');
    expect(markTag(html, 'priv-1')).toContain('qoe-mark-private');
    expect(markTag(html, 'pub-1')).toContain('qoe-mark-public');
    expect(markTag(html, 'official-1')).toContain('qoe-mark-official');
  });

  it('peint un passage sans note comme un surlignage, même public', () => {
    // ⚠️ Le défaut d'origine : la visibilité décidait de la peau. Un
    // surlignage public nu recevait donc le vermillon d'une annotation
    // publique, et un surlignage privé nu l'ambre d'une annotation
    // officielle. Le texte est le discriminant.
    const plainPrivate = { ...privateHighlight, id: 'plain-priv', note: null };
    const plainPublic = { ...publicHighlight, id: 'plain-pub', note: null };
    const html = renderBody([plainPrivate], [plainPublic], 'all');
    expect(markTag(html, 'plain-priv')).toContain('qoe-mark-highlight');
    expect(markTag(html, 'plain-pub')).toContain('qoe-mark-highlight');
    expect(markTag(html, 'plain-priv')).not.toContain('qoe-mark-private');
    expect(html).not.toContain('qoe-mark-public');
    expect(html).not.toContain('qoe-mark-private');
  });

  it('garde la peau officielle sur une marque d’auteur sans note', () => {
    const bareOfficial = { ...officialFromServer, id: 'official-bare', note: null };
    const html = renderBody([], [bareOfficial], 'all');
    expect(markTag(html, 'official-bare')).toContain('qoe-mark-official');
    expect(html).not.toContain('qoe-mark-highlight');
  });
});

describe('buildSegmentMarks — unité pure', () => {
  it('dédoublonne par identifiant à la peinture', () => {
    const marks = buildSegmentMarks(
      doc,
      0,
      0,
      [],
      [publicHighlight, { ...publicHighlight }],
      'all',
      'Créatrice'
    );
    expect(marks.filter((m) => m.id === 'pub-1')).toHaveLength(1);
  });

  it('produit les marques attendues pour le bloc 0 (officiel + public)', () => {
    const marks: PaintMark[] = buildSegmentMarks(
      doc,
      0,
      0,
      [],
      [officialFromServer, publicHighlight],
      'all',
      'Créatrice'
    );
    expect(marks.map((m) => m.id).sort()).toEqual(['official-1', 'pub-1'].sort());
    const official = marks.find((m) => m.id === 'official-1')!;
    expect(official.start).toBe(0);
    expect(official.end).toBe(7);
    const pub = marks.find((m) => m.id === 'pub-1')!;
    expect(pub.start).toBe(11);
    expect(pub.end).toBe(16);
  });
});

describe('CanonicalArticleBody — spotlight deep-link (tranche 6-b)', () => {
  it('peint la marque spotlight quand le sha du document correspond', () => {
    const html = renderToStaticMarkup(
      <CanonicalArticleBody
        document={doc}
        highlights={[]}
        allPublic={[]}
        filterMode="all"
        creatorName="Créatrice"
        onMarkClick={() => {}}
        spotlight={{ start: 19, end: 27, sha: 'sha-1' }}
      />
    );
    expect(html).toContain('data-highlight-id="spotlight-passage"');
    expect(html).toContain('data-spotlight="true"');
    expect(html).toContain('data-highlight-text="Deuxième"');
  });

  it('ne peint rien quand le sha est périmé (contenu ré-édité)', () => {
    const html = renderToStaticMarkup(
      <CanonicalArticleBody
        document={doc}
        highlights={[]}
        allPublic={[]}
        filterMode="all"
        creatorName="Créatrice"
        onMarkClick={() => {}}
        spotlight={{ start: 19, end: 27, sha: 'sha-ancien' }}
      />
    );
    expect(html).not.toContain('spotlight-passage');
  });

  it('reste visible même en filterMode=none (le passage demandé prime)', () => {
    const html = renderToStaticMarkup(
      <CanonicalArticleBody
        document={doc}
        highlights={[]}
        allPublic={[]}
        filterMode="none"
        creatorName="Créatrice"
        onMarkClick={() => {}}
        spotlight={{ start: 0, end: 7, sha: 'sha-1' }}
      />
    );
    expect(html).toContain('data-spotlight="true"');
    expect(html).toContain('data-highlight-text="Bonjour"');
  });

  it('peint une annotation publique du lecteur avec la peau publique, une seule fois', () => {
    const ownPublic: HighlightItem = {
      ...privateHighlight,
      id: 'own-pub',
      text: 'Bonjour',
      canonicalStart: 0,
      canonicalEnd: 7,
      isPublic: true,
      note: 'Publique',
    };
    const asAnnotation: AnnotationItem = {
      id: 'own-pub',
      text: 'Bonjour',
      canonicalStart: 0,
      canonicalEnd: 7,
      contentSha: 'sha-1',
      note: 'Publique',
      isPublic: true,
      isOfficial: false,
      upvotesCount: 0,
      createdAt: new Date().toISOString(),
      reader: { id: 'r1', name: 'Lectrice', username: 'lectrice', logoUrl: null },
    };

    // Présente dans les DEUX listes : une seule marque, et publique.
    const both = renderBody([ownPublic], [asAnnotation], 'all');
    expect(both.match(/data-highlight-id="own-pub"/g) ?? []).toHaveLength(1);
    const mark = both.match(/<mark[^>]*data-highlight-id="own-pub"[^>]*>/)?.[0] ?? '';
    expect(mark).toContain('qoe-mark-public');
    expect(mark).not.toContain('qoe-mark-private');

    // Présente seulement dans les surlignages : sa nature se lit quand même.
    const only = renderBody([ownPublic], [], 'all');
    const onlyMark = only.match(/<mark[^>]*data-highlight-id="own-pub"[^>]*>/)?.[0] ?? '';
    expect(onlyMark).toContain('qoe-mark-public');
  });

  it('marque multi-segment (paragraphe + liste) résolue par buildSegmentMarks', () => {
    const docMulti: CanonicalDocument = {
      blocks: [
        { kind: 'p', text: 'Intro' },
        { kind: 'list', ordered: false, items: [{ text: 'Point A' }, { text: 'Point B' }] },
      ],
      segments: [
        { blockIdx: 0, itemIdx: 0, text: 'Intro', start: 0, end: 5 },
        { blockIdx: 1, itemIdx: 0, text: 'Point A', start: 6, end: 13 },
        { blockIdx: 1, itemIdx: 1, text: 'Point B', start: 14, end: 21 },
      ],
      text: 'Intro Point A Point B',
      sha: 'sha-m',
    };
    // Spotlight sur « Point B » : ne doit apparaître que sur le 2e item.
    const marks: PaintMark[] = buildSegmentMarks(docMulti, 1, 1, [], [], 'all', 'Créatrice', {
      start: 14,
      end: 21,
      sha: 'sha-m',
    });
    expect(marks).toHaveLength(1);
    expect(marks[0].id).toBe('spotlight-passage');
    expect(marks[0].start).toBe(0);
    expect(marks[0].end).toBe(7);
    const empty = buildSegmentMarks(docMulti, 1, 0, [], [], 'all', 'Créatrice', {
      start: 14,
      end: 21,
      sha: 'sha-m',
    });
    expect(empty).toHaveLength(0);
  });

  it('rend la lettrine avec la classe et l’attribut canoniques', () => {
    const dropCapDoc: CanonicalDocument = {
      ...doc,
      blocks: doc.blocks.map((block, index) => (index === 0 ? { ...block, dropCap: true } : block)),
    };
    const html = renderToStaticMarkup(
      <CanonicalArticleBody
        document={dropCapDoc}
        highlights={[]}
        allPublic={[]}
        filterMode="all"
        containerId="article-content"
        creatorName="Créatrice"
        onMarkClick={() => {}}
      />
    );
    expect(html).toContain('data-drop-cap="true"');
    expect(html).toContain('has-drop-cap');
  });
});
