import React from 'react';

export interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * Sécurise une chaîne JSON contre les injections XSS dans un tag <script>.
 * Échappe les caractères <, >, & en entités unicode pour éviter l'évasion de balise.
 */
export function safeJsonLdReplacer(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Composant d'injection sémantique JSON-LD pour moteurs de recherche (Google Rich Results).
 */
export function JsonLd({ data }: JsonLdProps) {
  const jsonString = safeJsonLdReplacer(data);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonString }} />;
}

export interface ArticleSchemaInput {
  title: string;
  description?: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
  authorName?: string | null;
  authorUsername?: string | null;
  authorLogo?: string | null;
  coverImage?: string | null;
  baseUrl: string;
  /** Chemin canonique de l'article (ex. /tech/slug ou /alice/a/slug). */
  path?: string;
}

/**
 * Construit un schéma Schema.org de type 'Article' (le type annoncé par la
 * page ; `NewsArticle` n'est pas distingué côté produit).
 */
export function buildArticleSchema(input: ArticleSchemaInput) {
  // Repli : chemin canonique du lecteur (`/{proprietaire}/a/{slug}`).
  // `/article/{slug}` n'existe plus dans le core (seulement, en legacy, sur
  // les tenants) : un JSON-LD pointant dessus déclarait une URL 404.
  const owner = (input.authorUsername || 'qoefi').replace(/^@/, '');
  const url = input.path
    ? `${input.baseUrl.replace(/\/$/, '')}${input.path}`
    : `${input.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(owner)}/a/${encodeURIComponent(input.slug)}`;
  const authorUrl = input.authorUsername
    ? `${input.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(input.authorUsername)}`
    : input.baseUrl;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    headline: input.title,
    description: input.description || input.title,
    image: input.coverImage ? [input.coverImage] : undefined,
    datePublished: input.createdAt,
    dateModified: input.updatedAt || input.createdAt,
    author: {
      '@type': 'Person',
      name: input.authorName || input.authorUsername || 'Auteur',
      url: authorUrl,
      image: input.authorLogo || undefined,
    },
    publisher: {
      '@type': 'Organization',
      name: 'qoefi',
      url: 'https://qoe.fi',
    },
  };
}

export interface PersonSchemaInput {
  name?: string | null;
  username?: string | null;
  bio?: string | null;
  logoUrl?: string | null;
  baseUrl: string;
  /** Chemin canonique du profil, si l'app en sert un qui n'est pas `/{pseudo}`. */
  path?: string;
}

/**
 * Construit un schéma Schema.org conforme de type 'ProfilePage' + 'Person'.
 */
export function buildPersonSchema(input: PersonSchemaInput) {
  // `@pseudo` est une écriture d'affichage, pas un segment d'URL : sans ce
  // retrait, la canonique déclarée devenait `…/%40claire`, une page 404.
  const username = (input.username || 'creator').replace(/^@/, '');
  const baseUrl = input.baseUrl.replace(/\/$/, '');
  const url = input.path ? `${baseUrl}${input.path}` : `${baseUrl}/${encodeURIComponent(username)}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: input.name || `@${username}`,
      alternateName: `@${username}`,
      description: input.bio || undefined,
      image: input.logoUrl || undefined,
      url,
    },
  };
}

export interface WebSiteSchemaInput {
  name: string;
  url: string;
  description?: string;
  /** Nom alternatif (ex: ancien nom de marque) pour associer les requêtes. */
  alternateName?: string;
}

/**
 * Construit un schéma Schema.org de type 'WebSite'.
 */
export function buildWebSiteSchema(input: WebSiteSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    alternateName: input.alternateName || undefined,
    url: input.url,
    description: input.description,
  };
}

export interface BreadcrumbItemInput {
  name: string;
  url: string;
}

/**
 * Construit un schéma Schema.org conforme de type 'BreadcrumbList' pour Google Rich Results.
 */
export function buildBreadcrumbSchema(items: BreadcrumbItemInput[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
