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
}

/**
 * Construit un schéma Schema.org conforme de type 'Article' ou 'NewsArticle'.
 */
export function buildArticleSchema(input: ArticleSchemaInput) {
  const url = `${input.baseUrl.replace(/\/$/, '')}/article/${encodeURIComponent(input.slug)}`;
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
      name: 'qoe.fi',
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
}

/**
 * Construit un schéma Schema.org conforme de type 'ProfilePage' + 'Person'.
 */
export function buildPersonSchema(input: PersonSchemaInput) {
  const username = input.username || 'creator';
  const url = `${input.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(username)}`;

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
}

/**
 * Construit un schéma Schema.org de type 'WebSite'.
 */
export function buildWebSiteSchema(input: WebSiteSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    description: input.description,
  };
}
