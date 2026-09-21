import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import {
  JsonLd,
  safeJsonLdReplacer,
  buildArticleSchema,
  buildPersonSchema,
  buildWebSiteSchema,
  buildBreadcrumbSchema,
} from '../JsonLd';

describe('🛡️ SEO JsonLd Component & Builders', () => {
  it('sécurise les chaînes contre les injections XSS', () => {
    const malicious = {
      title: '</script><script>alert("xss")</script>',
      desc: 'Test & <tag> > 42',
    };
    const escaped = safeJsonLdReplacer(malicious);
    expect(escaped).not.toContain('</script>');
    expect(escaped).toContain('\\u003c/script\\u003e');
    expect(escaped).toContain('\\u0026');
    expect(escaped).toContain('\\u003e');
  });

  it('rend un élément script application/ld+json valide', () => {
    const data = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'qoefi' };
    const { container } = render(<JsonLd data={data} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeTruthy();
    expect(JSON.parse(script?.textContent || '{}')).toEqual(data);
  });

  it('génère un schéma Article complet conforme', () => {
    const schema = buildArticleSchema({
      title: 'Mon Super Article',
      description: 'Résumé captivant',
      slug: 'mon-super-article',
      createdAt: '2026-09-10T10:00:00Z',
      authorName: 'Alexandre',
      authorUsername: 'alex',
      authorLogo: 'https://cdn.qoe.fi/avatar.jpg',
      coverImage: 'https://cdn.qoe.fi/cover.jpg',
      baseUrl: 'https://qoe.fi',
    });

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Article');
    expect(schema.headline).toBe('Mon Super Article');
    expect(schema.mainEntityOfPage['@id']).toBe('https://qoe.fi/article/mon-super-article');
    expect(schema.author.name).toBe('Alexandre');
    expect(schema.author.url).toBe('https://qoe.fi/alex');
    expect(schema.image).toEqual(['https://cdn.qoe.fi/cover.jpg']);
  });

  it('génère un schéma Person conforme', () => {
    const schema = buildPersonSchema({
      name: 'Claire Dupont',
      username: 'claire',
      bio: 'Écrivaine et journaliste',
      logoUrl: 'https://cdn.qoe.fi/claire.png',
      baseUrl: 'https://qoe.fi',
    });

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('ProfilePage');
    expect(schema.mainEntity['@type']).toBe('Person');
    expect(schema.mainEntity.name).toBe('Claire Dupont');
    expect(schema.mainEntity.url).toBe('https://qoe.fi/claire');
  });

  it('génère un schéma WebSite conforme', () => {
    const schema = buildWebSiteSchema({
      name: 'qoefi',
      url: 'https://qoe.fi',
      description: 'Plateforme indépendante de publication et de lecture',
    });

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('WebSite');
    expect(schema.url).toBe('https://qoe.fi');
  });

  it('génère un schéma BreadcrumbList conforme', () => {
    const schema = buildBreadcrumbSchema([
      { name: 'Accueil', url: 'https://monblog.qoe.fi' },
      { name: 'Technologie', url: 'https://monblog.qoe.fi/technologie' },
      { name: 'IA', url: 'https://monblog.qoe.fi/ia' },
      { name: 'Mon article', url: 'https://monblog.qoe.fi/ia/mon-article' },
    ]);

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toHaveLength(4);
    expect(schema.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Accueil',
      item: 'https://monblog.qoe.fi',
    });
    expect(schema.itemListElement[2]).toEqual({
      '@type': 'ListItem',
      position: 3,
      name: 'IA',
      item: 'https://monblog.qoe.fi/ia',
    });
  });
});
