// =====================================================================
// 📜 ArticleStreamBlock.tsx — Flux de Publications & Archives (Licorne 2026)
// =====================================================================
// Affiche le catalogue d'articles sous forme de liste ou de grille (2/3 cols).
// Supporte :
// - Densité paramétrable (compact, standard, spacious)
// - Affichage des extraits, temps de lecture, badges de catégorie
// - Format accessible et balisé pour le SEO
// =====================================================================

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Clock } from 'lucide-react';
import type {
  ArticleStreamBlockProps,
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';

interface ArticleStreamBlockComponentProps {
  id: string;
  props: ArticleStreamBlockProps;
  articles?: TemplateArticleItem[];
  publication?: TemplatePublicationContext;
  cardShape?: CardCornerShape;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
}

export function ArticleStreamBlock({
  id,
  props,
  articles = [],
  cardShape = 'rounded-xl',
  context,
  visible = true,
  locked = false,
}: ArticleStreamBlockComponentProps) {
  const {
    displayMode = 'list',
    density = 'standard',
    showReadingTime = true,
    showExcerpts = true,
    showCategories = true,
  } = props;

  const fallbackArticles: TemplateArticleItem[] = [
    {
      id: 'art_fb_1',
      title: 'Repenser l’autonomie éditoriale à l’ère des plateformes fermées',
      slug: 'autonomie-editoriale',
      excerpt:
        'Une réflexion sur l’importance de posséder son nom de domaine, son design et sa base d’abonnés sans intermédiaire.',
      imageUrl:
        'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=600&auto=format&fit=crop',
      readingTime: 4,
      publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      category: { name: 'Souveraineté' },
    },
    {
      id: 'art_fb_2',
      title: 'L’économie de l’attention et la renaissance des longs formats',
      slug: 'renaissance-longs-formats',
      excerpt:
        'Pourquoi les lecteurs fatigués du scroll infini se tournent vers des essais denses et documentés.',
      imageUrl:
        'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?q=80&w=600&auto=format&fit=crop',
      readingTime: 7,
      publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      category: { name: 'Médias' },
    },
    {
      id: 'art_fb_3',
      title: 'Comment structurer une newsletter qui dure dans le temps',
      slug: 'structurer-newsletter-durable',
      excerpt:
        'Les principes cardinaux pour bâtir un rendez-vous hebdomadaire attendu sans s’épuiser.',
      imageUrl:
        'https://images.unsplash.com/photo-1512486130939-2c4f79935e4f?q=80&w=600&auto=format&fit=crop',
      readingTime: 5,
      publishedAt: new Date(Date.now() - 86400000 * 9).toISOString(),
      category: { name: 'Pratique' },
    },
  ];

  const items = articles.length > 0 ? articles : fallbackArticles;

  const paddingY = density === 'compact' ? 'py-3' : density === 'spacious' ? 'py-7' : 'py-5';

  return (
    <BlockWrapper
      id={id}
      type="article-stream"
      label="Flux de Publications"
      visible={visible}
      locked={locked}
      context={context}
    >
      <section className="container mx-auto px-4 lg:px-8 py-8 md:py-14">
        {displayMode === 'list' ? (
          /* Mode Liste */
          <div className="max-w-4xl mx-auto divide-y divide-border">
            {items.map((article) => (
              <article key={article.id} className={`${paddingY} group`}>
                <Link
                  href={`/article/${article.slug}`}
                  onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                  className="flex flex-col sm:flex-row gap-5 items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      {showCategories && article.category && (
                        <span className="font-semibold text-foreground">
                          {article.category.name}
                        </span>
                      )}
                      {article.publishedAt && (
                        <span>
                          {new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                      {showReadingTime && article.readingTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 opacity-60" />
                          {article.readingTime} min
                        </span>
                      )}
                      {article.isPremium && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-warning/15 text-warning">
                          Club
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl md:text-2xl font-bold tracking-tight text-foreground group-hover:text-[var(--tenant-accent,hsl(var(--primary)))] transition-colors">
                      {article.title}
                    </h3>

                    {showExcerpts && article.excerpt && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed max-w-2xl">
                        {article.excerpt}
                      </p>
                    )}
                  </div>

                  {article.imageUrl && (
                    <div
                      className={`relative w-full sm:w-44 h-32 shrink-0 overflow-hidden bg-muted shadow-xs ${cardShape}`}
                    >
                      <Image
                        src={article.imageUrl}
                        alt={article.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-104"
                      />
                    </div>
                  )}
                </Link>
              </article>
            ))}
          </div>
        ) : (
          /* Mode Grille (2 ou 3 colonnes) */
          <div
            className={`grid grid-cols-1 md:grid-cols-2 ${
              displayMode === 'grid-3' ? 'lg:grid-cols-3' : ''
            } gap-6`}
          >
            {items.map((article) => (
              <article
                key={article.id}
                className={`group flex flex-col justify-between overflow-hidden bg-card border border-border transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${cardShape}`}
              >
                <Link
                  href={`/article/${article.slug}`}
                  onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                  className="flex flex-col h-full"
                >
                  {article.imageUrl && (
                    <div className="relative w-full h-44 overflow-hidden bg-muted">
                      <Image
                        src={article.imageUrl}
                        alt={article.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-103"
                      />
                    </div>
                  )}

                  <div className="p-5 flex flex-col justify-between flex-1">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        {showCategories && article.category && (
                          <span className="font-semibold text-foreground">
                            {article.category.name}
                          </span>
                        )}
                        {showReadingTime && article.readingTime && (
                          <span>{article.readingTime} min</span>
                        )}
                      </div>

                      <h3 className="font-bold text-lg text-foreground group-hover:text-[var(--tenant-accent,hsl(var(--primary)))] transition-colors leading-snug">
                        {article.title}
                      </h3>

                      {showExcerpts && article.excerpt && (
                        <p className="mt-2 text-xs md:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                          {article.excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </BlockWrapper>
  );
}
