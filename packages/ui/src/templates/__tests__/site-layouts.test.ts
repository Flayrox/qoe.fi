import { describe, it, expect } from 'vitest';
import {
  parseLayoutConfig,
  parseSiteLayouts,
  serializeLayoutConfig,
  serializeSiteLayouts,
} from '../parser';
import { resolveBlockStyle } from '../style';
import { ARCHETYPES_REGISTRY, ARTICLE_VARIANTS } from '../defaults';

describe('parseSiteLayouts — rétrocompatibilité', () => {
  it('parse un LayoutConfig plat vers home sans article', () => {
    const raw = serializeLayoutConfig(ARCHETYPES_REGISTRY.minimal);
    const { home, article } = parseSiteLayouts(raw);
    expect(home.archetype).toBe('minimal');
    expect(article).toBeNull();
  });

  it('parse un nom d’archétype vers home sans article', () => {
    const { home, article } = parseSiteLayouts('magazine');
    expect(home.blocks.length).toBeGreaterThan(0);
    expect(article).toBeNull();
  });

  it('parse un fichier scopes v2 vers home + article', () => {
    const raw = serializeSiteLayouts(ARCHETYPES_REGISTRY.minimal, ARTICLE_VARIANTS[0].config);
    const { home, article } = parseSiteLayouts(raw);
    expect(home.archetype).toBe('minimal');
    expect(article).not.toBeNull();
    expect(article?.blocks.some((b) => b.type === 'article-content')).toBe(true);
  });

  it('ne lève jamais sur entrée corrompue', () => {
    const { home, article } = parseSiteLayouts('{corrompu');
    expect(home.blocks.length).toBeGreaterThan(0);
    expect(article).toBeNull();
  });
});

describe('serializeSiteLayouts — format stable', () => {
  it('sans article : format legacy plat', () => {
    const raw = serializeSiteLayouts(ARCHETYPES_REGISTRY.minimal, null);
    const parsed = JSON.parse(raw) as { scopes?: unknown; blocks?: unknown };
    expect(parsed.scopes).toBeUndefined();
    expect(Array.isArray(parsed.blocks)).toBe(true);
  });

  it('avec article : fichier scopes v2', () => {
    const raw = serializeSiteLayouts(ARCHETYPES_REGISTRY.minimal, ARTICLE_VARIANTS[0].config);
    const parsed = JSON.parse(raw) as {
      version: number;
      scopes: { home: { archetype: string }; article: { blocks: unknown[] } };
    };
    expect(parsed.version).toBe(2);
    expect(parsed.scopes.home.archetype).toBe('minimal');
    expect(parsed.scopes.article.blocks.length).toBeGreaterThan(0);
  });

  it('overrides par rubrique : aller-retour', () => {
    const raw = serializeSiteLayouts(ARCHETYPES_REGISTRY.minimal, ARTICLE_VARIANTS[0].config, {
      essais: ARTICLE_VARIANTS[2].config,
    });
    const { articleByCategory } = parseSiteLayouts(raw);
    expect(articleByCategory.essais?.blocks.some((b) => b.type === 'article-content')).toBe(true);
  });
});

describe('parseLayoutConfig — champs v2 préservés', () => {
  it('préserve hiddenAt, oid, categoryFilter et style', () => {
    const base = JSON.parse(serializeLayoutConfig(ARCHETYPES_REGISTRY.bento)) as {
      blocks: Record<string, unknown>[];
    };
    base.blocks[0] = {
      ...base.blocks[0],
      oid: 'oid_test',
      hiddenAt: ['mobile'],
      props: {
        ...(base.blocks[0].props as object),
        categoryFilter: 'essais',
        style: { opacity: 80 },
      },
    };
    const parsed = parseLayoutConfig(JSON.stringify(base));
    const block = parsed.blocks[0];
    expect(block.oid).toBe('oid_test');
    expect(block.hiddenAt).toEqual(['mobile']);
    expect((block.props as { categoryFilter?: string }).categoryFilter).toBe('essais');
  });

  it('filtre hiddenAt invalide', () => {
    const base = JSON.parse(serializeLayoutConfig(ARCHETYPES_REGISTRY.bento)) as {
      blocks: Record<string, unknown>[];
    };
    base.blocks[0] = { ...base.blocks[0], hiddenAt: ['mobile', 'nope'] };
    const parsed = parseLayoutConfig(JSON.stringify(base));
    expect(parsed.blocks[0].hiddenAt).toEqual(['mobile']);
  });
});

describe('resolveBlockStyle', () => {
  it('mappe opacité, rayon, marges et styleBox', () => {
    const css = resolveBlockStyle({
      opacity: 50,
      radius: 8,
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      styleBox: { pt: 10, maxWidth: 800 },
    });
    expect(css.opacity).toBe(0.5);
    expect(css.borderRadius).toBe(8);
    expect(css.padding).toBe('1px 2px 3px 4px');
    expect(css.paddingTop).toBe(10);
    expect(css.maxWidth).toBe(800);
  });

  it('mappe Hug/Fill et coins indépendants', () => {
    const css = resolveBlockStyle({
      width: { mode: 'fill' },
      height: { mode: 'fixed', value: 400 },
      radius: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 },
    });
    expect(css.width).toBe('100%');
    expect(css.height).toBe(400);
    expect(css.borderRadius).toBe('1px 2px 3px 4px');
  });
});

describe('registres', () => {
  it('8 archétypes + 3 variantes article valides', () => {
    for (const id of [
      'magazine',
      'broadsheet',
      'bento',
      'minimal',
      'encre',
      'papier',
      'signal',
      'kiosque',
    ]) {
      expect(ARCHETYPES_REGISTRY[id]?.blocks.length).toBeGreaterThan(0);
    }
    expect(ARTICLE_VARIANTS).toHaveLength(3);
    for (const v of ARTICLE_VARIANTS) {
      expect(v.config.blocks.some((b) => b.type === 'article-content')).toBe(true);
    }
  });
});
