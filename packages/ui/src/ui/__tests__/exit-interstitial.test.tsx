import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseExternalUrl, ExitCard } from '../exit-interstitial';

describe('parseExternalUrl — Analyseur souverain d’URL externe', () => {
  it('extrait correctement le nom d’hôte et l’URL pour HTTPS', () => {
    const res = parseExternalUrl('https://www.youtube.com/watch?v=123');
    expect(res.isValid).toBe(true);
    expect(res.hostname).toBe('youtube.com');
    expect(res.displayUrl).toBe('https://www.youtube.com/watch?v=123');
    expect(res.isHttps).toBe(true);
  });

  it('gère correctement le protocole HTTP non chiffré', () => {
    const res = parseExternalUrl('http://insecure-blog.org/article');
    expect(res.isValid).toBe(true);
    expect(res.hostname).toBe('insecure-blog.org');
    expect(res.isHttps).toBe(false);
  });

  it('rejette les protocoles dangereux (javascript:, data:, etc.)', () => {
    expect(parseExternalUrl('javascript:alert(1)').isValid).toBe(false);
    expect(parseExternalUrl('data:text/html,test').isValid).toBe(false);
    expect(parseExternalUrl('blob:https://example.com/uuid').isValid).toBe(false);
  });

  it('rejette les valeurs vides, nulles ou non valides', () => {
    expect(parseExternalUrl(null).isValid).toBe(false);
    expect(parseExternalUrl('').isValid).toBe(false);
    expect(parseExternalUrl('   ').isValid).toBe(false);
    expect(parseExternalUrl('not-a-valid-url').isValid).toBe(false);
  });
});

describe('ExitCard — Rendu Apple-esque de la carte de sortie', () => {
  it('affiche le nom de domaine cible et le bouton de continuation pour une URL valide', () => {
    const html = renderToStaticMarkup(
      <ExitCard
        targetUrl="https://substack.com/@creator"
        publicationName="Le Carnet"
        onBackUrl="/"
      />
    );

    expect(html).toContain('Redirection externe');
    expect(html).toContain('Ouvrir substack.com');
    expect(html).toContain('Le Carnet');
    expect(html).toContain('https://substack.com/@creator');
    expect(html).toContain('Continuer vers le site');
    expect(html).toContain('Retourner');
  });

  it('affiche un message de sécurité élégant si l’URL est absente ou invalide', () => {
    const html = renderToStaticMarkup(
      <ExitCard targetUrl="javascript:void(0)" publicationName="Le Carnet" onBackUrl="/" />
    );

    expect(html).toContain('L’adresse fournie est incomplète ou utilise un protocole non reconnu.');
    expect(html).not.toContain('Continuer vers');
  });
});
