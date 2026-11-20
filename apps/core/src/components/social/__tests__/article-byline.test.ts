// @vitest-environment node
// =====================================================================
// 🧪 article-byline — une seule résolution média/auteur (R132)
// =====================================================================
// La signature d'un article (média vs auteur) était écrite deux fois : dans
// le tiroir de lecture et dans l'annotateur. Les deux copies avaient déjà
// divergé (le tiroir comparait `author.name`, l'annotateur
// `author.journalist.name`). Ces garanties fixent les trois formes de
// signature et interdisent la réapparition d'une seconde implémentation.
// =====================================================================

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { resolveArticleByline } from '../article-byline';

const MEDIA_PUBLISHER = {
  id: 'pub-1',
  type: 'MEDIA',
  name: 'Qoefi Média',
  slug: 'qoefi-media',
  subdomain: 'qoefi',
  logoUrl: 'https://exemple.test/logo.png',
  isCertified: true,
};

describe('resolveArticleByline', () => {
  it('résout un article de média avec son journaliste', () => {
    const byline = resolveArticleByline({
      publisher: MEDIA_PUBLISHER,
      author: {
        id: 'auth-1',
        name: 'Qoefi Média',
        username: 'qoefi',
        type: 'MEDIA',
        journalist: { id: 'j-1', name: 'Alice Martin', username: 'alice', logoUrl: null },
      },
    });

    expect(byline.isMedia).toBe(true);
    expect(byline.mediaName).toBe('Qoefi Média');
    expect(byline.mediaHandle).toBe('qoefi');
    expect(byline.mediaCertified).toBe(true);
    expect(byline.writerName).toBe('Alice Martin');
    expect(byline.writerHandle).toBe('alice');
    expect(byline.authorName).toBe('Qoefi Média');
    expect(byline.authorHandle).toBe('qoefi');
    expect(byline.subtitle).toBe('Qoefi Média · par Alice Martin');
    expect(byline.targetFollowId).toBe('pub-1');
  });

  it('résout un article personnel (auteur seul, sans média)', () => {
    const byline = resolveArticleByline({
      publisher: null,
      author: { id: 'auth-2', name: 'Camille', username: 'camille', type: 'PERSONAL' },
    });

    expect(byline.isMedia).toBe(false);
    expect(byline.authorName).toBe('Camille');
    expect(byline.authorHandle).toBe('camille');
    expect(byline.personalAuthorName).toBe('Camille');
    expect(byline.personalAuthorHandle).toBe('camille');
    expect(byline.subtitle).toBe('Camille');
    expect(byline.targetFollowId).toBe('auth-2');
  });

  it('ne casse pas quand le média est seul (aucun auteur)', () => {
    const byline = resolveArticleByline({ publisher: MEDIA_PUBLISHER, author: null });

    expect(byline.isMedia).toBe(true);
    expect(byline.mediaName).toBe('Qoefi Média');
    expect(byline.writerName).toBe('Auteur');
    expect(byline.authorName).toBe('Qoefi Média');
    expect(byline.subtitle).toBe('Qoefi Média');
    expect(byline.targetFollowId).toBe('pub-1');
  });

  it('ne casse pas quand l’auteur est seul (aucun publisher) et retombe sur « Média »', () => {
    const byline = resolveArticleByline({
      author: { id: 'auth-3', name: 'Nadia', username: 'nadia', type: 'PERSONAL' },
    });

    expect(byline.isMedia).toBe(false);
    expect(byline.mediaName).toBe('Média');
    expect(byline.mediaHandle).toBe('');
    expect(byline.mediaLogo).toBeNull();
    expect(byline.authorName).toBe('Nadia');
    expect(byline.subtitle).toBe('Nadia');
  });

  it('tranche la divergence historique : média dont le journaliste diffère du compte média', () => {
    // Aucun `type` : seule l'heuristique de nom décide. Le tiroir répondait
    // « personnel » (il comparait au nom du compte média), l'annotateur
    // « média » (il comparait au nom du journaliste) — R132.
    const byline = resolveArticleByline({
      publisher: { id: 'pub-2', name: 'Le Monde', slug: 'le-monde' },
      author: {
        id: 'auth-4',
        name: 'Le Monde',
        username: 'lemonde',
        journalist: { id: 'j-2', name: 'Alice Martin', username: 'alice', logoUrl: null },
      },
    });

    expect(byline.isMedia).toBe(true);
    expect(byline.subtitle).toBe('Le Monde · par Alice Martin');
  });

  it('n’a qu’un seul site d’implémentation : les deux composants consomment la résolution', () => {
    const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const annotator = read('ArticleAnnotatorView.tsx');
    const drawer = read('ArticleReaderDrawer.tsx');

    // Aucun des deux ne réimplémente l'heuristique ni le libellé du tiroir.
    for (const [name, source] of [
      ['ArticleAnnotatorView.tsx', annotator],
      ['ArticleReaderDrawer.tsx', drawer],
    ] as const) {
      expect(source, `${name} doit importer la résolution partagée`).toContain(
        "from './article-byline'"
      );
      expect(source, `${name} ne doit plus comparer média/auteur`).not.toMatch(
        /\.trim\(\)\s*\.toLowerCase\(\)/
      );
      expect(source, `${name} ne doit plus composer le libellé du tiroir`).not.toContain('· par');
    }
  });
});
