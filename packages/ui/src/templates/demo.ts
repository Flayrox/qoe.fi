// demo.ts — articles de démonstration neutres pour le mode édition.
// En design, le Studio rend toujours ces placeholders (jamais les vrais
// articles) pour visualiser la mise en page même sans contenu.
// En preview/live, ce sont les vrais articles qui sont rendus.

import type { TemplateArticleItem } from './schema';

export const DEMO_ARTICLES: TemplateArticleItem[] = [
  {
    id: 'demo_art_1',
    title: "Titre de l'article",
    slug: 'demo-article-1',
    excerpt: '',
    imageUrl:
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1600&auto=format&fit=crop',
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
    imageUrl:
      'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=800&auto=format&fit=crop',
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
    imageUrl:
      'https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?q=80&w=800&auto=format&fit=crop',
    readingTime: 3,
    publishedAt: new Date().toISOString(),
    category: { name: 'Rubrique' },
    isPremium: false,
  },
];
