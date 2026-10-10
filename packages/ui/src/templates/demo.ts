// demo.ts — articles de démonstration neutres pour le mode édition.
// En design, le Studio rend toujours ces placeholders (jamais les vrais
// articles) pour visualiser la mise en page même sans contenu.
// En preview/live, ce sont les vrais articles qui sont rendus.

import type { TemplateArticleItem } from './schema';
import { PLACEHOLDER_COVER_1, PLACEHOLDER_COVER_2, PLACEHOLDER_COVER_3 } from './placeholders';

export const DEMO_ARTICLES: TemplateArticleItem[] = [
  {
    id: 'demo_art_1',
    title: "Titre de l'article",
    slug: 'demo-article-1',
    excerpt: '',
    imageUrl: PLACEHOLDER_COVER_1,
    readingTime: 4,
    publishedAt: new Date().toISOString(),
    category: { name: 'Rubrique' },
    isPremium: false,
  },
  {
    id: 'demo_art_2',
    title: "Titre de l'article",
    slug: 'demo-article-2',
    excerpt: '',
    imageUrl: PLACEHOLDER_COVER_2,
    readingTime: 5,
    publishedAt: new Date().toISOString(),
    category: { name: 'Rubrique' },
    isPremium: false,
  },
  {
    id: 'demo_art_3',
    title: "Titre de l'article",
    slug: 'demo-article-3',
    excerpt: '',
    imageUrl: PLACEHOLDER_COVER_3,
    readingTime: 3,
    publishedAt: new Date().toISOString(),
    category: { name: 'Rubrique' },
    isPremium: false,
  },
];
