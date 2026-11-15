import { describe, expect, it } from 'vitest';
import {
  analyzeContentHealth,
  type HealthArticleInput,
  type HealthIssueId,
} from '../content-health';

const NOW = new Date('2026-11-15T12:00:00.000Z');

const longBody = `<p>${'mot '.repeat(200)}</p>`;

function makeArticle(overrides: Partial<HealthArticleInput> = {}): HealthArticleInput {
  return {
    id: 'a1',
    title: 'Un article complet',
    slug: 'un-article-complet',
    content: longBody,
    published: true,
    imageUrl: 'https://cdn.test/cover.jpg',
    coverAlt: 'Une couverture décrite',
    coverDecorative: false,
    seoTitle: 'Titre SEO',
    seoDescription: 'Description SEO',
    categoryId: 'c1',
    category: { id: 'c1', name: 'Essais', slug: 'essais' },
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

function issuesFor(overrides: Partial<HealthArticleInput>): HealthIssueId[] {
  const report = analyzeContentHealth([makeArticle(overrides)], NOW);
  return report.articles[0]?.issues ?? [];
}

describe('analyse de santé du contenu', () => {
  it('ne signale aucun défaut sur un article publié complet', () => {
    const report = analyzeContentHealth([makeArticle()], NOW);

    expect(report.publishedCount).toBe(1);
    expect(report.healthyCount).toBe(1);
    expect(report.score).toBe(100);
    expect(report.articles).toEqual([]);
  });

  it('ignore les brouillons et les articles non publiés', () => {
    const report = analyzeContentHealth(
      [
        makeArticle({ published: false, content: '', imageUrl: null }),
        makeArticle({ id: 'a2', published: false }),
      ],
      NOW
    );

    expect(report.publishedCount).toBe(0);
    expect(report.articles).toEqual([]);
    expect(report.score).toBe(100);
  });

  it('détecte couverture, alt de couverture et images sans alt', () => {
    expect(issuesFor({ imageUrl: null })).toContain('missingCover');
    expect(issuesFor({ coverAlt: '  ' })).toContain('coverWithoutAlt');
    expect(issuesFor({ coverDecorative: true, coverAlt: '' })).not.toContain('coverWithoutAlt');

    expect(issuesFor({ content: '<p>Texte</p><img src="x.jpg">' })).toContain('imagesWithoutAlt');
    expect(issuesFor({ content: '<p>Texte</p><img src="x.jpg" alt="Un paysage">' })).not.toContain(
      'imagesWithoutAlt'
    );
  });

  it('détecte les champs SEO vides et un contenu trop court', () => {
    expect(issuesFor({ seoTitle: null })).toContain('missingSeoTitle');
    expect(issuesFor({ seoDescription: '   ' })).toContain('missingSeoDescription');
    expect(issuesFor({ content: '<p>Deux mots</p>' })).toContain('shortContent');
  });

  it('détecte un article ancien, non classé ou avec un lien invalide', () => {
    expect(issuesFor({ updatedAt: '2024-01-01T00:00:00.000Z' })).toContain('stale');
    expect(issuesFor({ categoryId: null, category: null })).toContain('uncategorized');
    expect(issuesFor({ content: `${longBody}<p><a href="#">Source</a></p>` })).toContain(
      'invalidLinks'
    );
  });

  it('classe les articles les plus problematiques en premier et calcule le score', () => {
    const report = analyzeContentHealth(
      [
        makeArticle({ id: 'sain', updatedAt: '2026-10-02T09:00:00.000Z' }),
        makeArticle({
          id: 'leger',
          seoTitle: null,
          updatedAt: '2026-10-03T09:00:00.000Z',
        }),
        makeArticle({
          id: 'lourd',
          imageUrl: null,
          seoTitle: null,
          seoDescription: null,
          content: '<p>Court</p>',
          categoryId: null,
          category: null,
          updatedAt: '2026-10-04T09:00:00.000Z',
        }),
      ],
      NOW
    );

    expect(report.publishedCount).toBe(3);
    expect(report.healthyCount).toBe(1);
    expect(report.score).toBe(33);
    expect(report.articles.map((article) => article.id)).toEqual(['lourd', 'leger']);
    expect(report.issueCounts.missingSeoTitle).toBe(2);
    expect(report.issueCounts.missingCover).toBe(1);
    expect(report.issueCounts.uncategorized).toBe(1);
  });

  it('compte une seule fois un défaut par article', () => {
    const report = analyzeContentHealth(
      [makeArticle({ content: `${longBody}<img src="a.jpg"><img src="b.jpg">` })],
      NOW
    );

    expect(report.issueCounts.imagesWithoutAlt).toBe(1);
    expect(report.articles[0]?.issues.filter((issue) => issue === 'imagesWithoutAlt')).toHaveLength(
      1
    );
  });
});
