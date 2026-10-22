import { describe, expect, it } from 'vitest';
import { resolveTenantNavigation } from '../navigation';

describe('resolveTenantNavigation — Moteur souverain de navigation Tenant', () => {
  const dummyCategories = [
    { id: 'cat_tech', name: 'Technologie', slug: 'tech', parentId: null },
    { id: 'cat_ai', name: 'Intelligence Artificielle', slug: 'ia', parentId: 'cat_tech' },
    { id: 'cat_internal', name: 'Brouillons Internes', slug: 'internes', parentId: null },
    { id: 'cat_design', name: 'Design', slug: 'design', parentId: null },
  ];

  const dummyNavigation = [
    {
      id: 'ext_1',
      label: 'Podcast',
      url: 'https://podcast.com',
      order: 0,
      isExternal: true,
      parentId: null,
    },
    {
      id: 'ext_2',
      label: 'Boutique',
      url: 'https://shop.com',
      order: 1,
      isExternal: true,
      parentId: null,
    },
  ];

  it('génère la navigation avec rubriques et sous-rubriques hiérarchiques', () => {
    const res = resolveTenantNavigation({
      categories: dummyCategories,
      navigation: [],
      siteOptions: {},
    });

    // 3 catégories racines : tech, internes, design
    expect(res.rootCategories.length).toBe(3);
    expect(res.visibleCategories.length).toBe(4);

    // tech a une sous-rubrique (ia)
    const techItem = res.navItems.find((n) => n.id === 'cat_tech');
    expect(techItem).toBeDefined();
    expect(techItem?.label).toBe('Technologie');
    expect(techItem?.url).toBe('/tech');
    expect(techItem?.children?.length).toBe(1);
    expect(techItem?.children?.[0].label).toBe('Intelligence Artificielle');
    expect(techItem?.children?.[0].url).toBe('/ia');
  });

  it('exclut automatiquement les catégories marquées comme masquées (hiddenNavCategoryIds)', () => {
    const res = resolveTenantNavigation({
      categories: dummyCategories,
      navigation: [],
      siteOptions: {
        hiddenNavCategoryIds: ['cat_internal'],
      },
    });

    // cat_internal ne doit pas apparaître dans les rubriques visibles ni navItems
    expect(res.rootCategories.map((c) => c.id)).not.toContain('cat_internal');
    expect(res.visibleCategories.map((c) => c.id)).not.toContain('cat_internal');
    expect(res.navItems.map((n) => n.id)).not.toContain('cat_internal');
  });

  it('fusionne harmonieusement les rubriques actives et les liens externes', () => {
    const res = resolveTenantNavigation({
      categories: dummyCategories,
      navigation: dummyNavigation,
      siteOptions: {
        hiddenNavCategoryIds: ['cat_internal'],
      },
    });

    // 2 rubriques racines actives (tech, design) + 2 liens externes (podcast, boutique) = 4 items de menu
    expect(res.navItems.length).toBe(4);

    const podcast = res.navItems.find((n) => n.label === 'Podcast');
    expect(podcast).toBeDefined();
    expect(podcast?.isExternal).toBe(true);
    expect(podcast?.url).toBe('https://podcast.com');

    const shop = res.navItems.find((n) => n.label === 'Boutique');
    expect(shop).toBeDefined();
    expect(shop?.isExternal).toBe(true);
  });

  it('n’affiche qu’une fois les catégories homonymes dans le menu', () => {
    const res = resolveTenantNavigation({
      categories: [
        { id: 'cat_sport_1', name: 'Sport', slug: 'sport-1', parentId: null },
        { id: 'cat_sport_2', name: 'Sport', slug: 'sport-2', parentId: null },
        { id: 'cat_sport_3', name: ' sport ', slug: 'sport-3', parentId: null },
        { id: 'cat_design', name: 'Design', slug: 'design', parentId: null },
      ],
      navigation: [],
      siteOptions: {},
    });

    expect(res.rootCategories.map((c) => c.slug)).toEqual(['sport-1', 'design']);
    expect(res.navItems.filter((n) => n.label.trim().toLowerCase() === 'sport')).toHaveLength(1);
  });

  it('ignore les liens externes sans URL exploitable (placeholder https://)', () => {
    const res = resolveTenantNavigation({
      categories: [],
      navigation: [
        {
          id: 'ext_empty',
          label: 'Nouveau lien',
          url: '',
          order: 0,
          isExternal: true,
          parentId: null,
        },
        {
          id: 'ext_scheme',
          label: 'Lien incomplet',
          url: 'https://',
          order: 1,
          isExternal: true,
          parentId: null,
        },
        {
          id: 'ext_ok',
          label: 'Podcast',
          url: 'https://podcast.com',
          order: 2,
          isExternal: true,
          parentId: null,
        },
      ],
      siteOptions: {},
    });

    expect(res.navItems.map((n) => n.id)).toEqual(['ext_ok']);
    expect(res.externalLinks.map((n) => n.id)).toEqual(['ext_ok']);
  });

  it('utilise le repli pour anciens liens internes si aucune catégorie n’existe', () => {
    const legacyNav = [
      {
        id: 'leg_1',
        label: 'À propos',
        url: '/a-propos',
        order: 0,
        isExternal: false,
        parentId: null,
      },
    ];

    const res = resolveTenantNavigation({
      categories: [],
      navigation: legacyNav,
      siteOptions: {},
    });

    expect(res.navItems.length).toBe(1);
    expect(res.navItems[0].label).toBe('À propos');
    expect(res.navItems[0].url).toBe('/a-propos');
  });
});

describe('Taxonomie — Normalisation, recherche et filtrage récursif des articles', () => {
  const dummyCategories = [
    { id: 'cat_tech', name: 'Technologie', slug: 'technologie', parentId: null },
    { id: 'cat_ai', name: 'Intelligence Artificielle', slug: 'ia', parentId: 'cat_tech' },
    { id: 'cat_ml', name: 'Machine Learning', slug: 'machine-learning', parentId: 'cat_ai' },
    { id: 'cat_design', name: 'Design', slug: 'design', parentId: null },
  ];

  const dummyArticles = [
    { id: 'art_1', title: 'Tech Globale', categoryId: 'cat_tech', published: true },
    { id: 'art_2', title: 'Deep Learning', categoryId: 'cat_ml', published: true },
    { id: 'art_3', title: 'Design System', categoryId: 'cat_design', published: true },
    { id: 'art_4', title: 'Brouillon Tech', categoryId: 'cat_tech', published: false },
    {
      id: 'art_5',
      title: 'Article avec slug seul',
      category: { slug: 'ia', name: 'IA' },
      published: true,
    },
  ];

  it('normalise les slugs avec accents, majuscules et espaces', async () => {
    const { normalizeCategorySlug } = await import('../navigation');
    expect(normalizeCategorySlug(' Électronique & Médias ')).toBe('electronique-medias');
    expect(normalizeCategorySlug('Technologie')).toBe('technologie');
  });

  it('trouve une catégorie par slug exact, insensible à la casse ou accentué', async () => {
    const { findCategoryBySlug } = await import('../navigation');
    expect(findCategoryBySlug(dummyCategories, 'technologie')?.id).toBe('cat_tech');
    expect(findCategoryBySlug(dummyCategories, 'TECHNOLOGIE')?.id).toBe('cat_tech');
    expect(findCategoryBySlug(dummyCategories, 'IA')?.id).toBe('cat_ai');
    expect(findCategoryBySlug(dummyCategories, 'inconnue')).toBeUndefined();
  });

  it('résout récursivement les sous-catégories descendantes (enfants et petits-enfants)', async () => {
    const { getDescendantCategoryIds } = await import('../navigation');
    const descendants = getDescendantCategoryIds(dummyCategories, 'cat_tech');
    expect(descendants.has('cat_ai')).toBe(true);
    expect(descendants.has('cat_ml')).toBe(true);
    expect(descendants.has('cat_design')).toBe(false);
  });

  it('filtre les articles pour une catégorie parente en incluant tous ses descendants', async () => {
    const { filterArticlesByCategory } = await import('../navigation');
    const filtered = filterArticlesByCategory(
      dummyArticles,
      { id: 'cat_tech', slug: 'technologie' },
      dummyCategories
    );

    // Devrait inclure art_1 (tech), art_2 (ml), art_5 (ia) mais exclure art_3 (design) et art_4 (brouillon)
    const titles = filtered.map((a) => a.title);
    expect(titles).toContain('Tech Globale');
    expect(titles).toContain('Deep Learning');
    expect(titles).toContain('Article avec slug seul');
    expect(titles).not.toContain('Design System');
    expect(titles).not.toContain('Brouillon Tech');
    expect(filtered.length).toBe(3);
  });

  it('filtre strictement pour une sous-catégorie feuille', async () => {
    const { filterArticlesByCategory } = await import('../navigation');
    const filtered = filterArticlesByCategory(
      dummyArticles,
      { id: 'cat_ml', slug: 'machine-learning' },
      dummyCategories
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe('Deep Learning');
  });
});
