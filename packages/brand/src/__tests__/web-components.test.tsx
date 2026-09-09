import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Logo,
  LogoSymbol,
  LogoWordmark,
  CertifiedBadge,
  MediaBadge,
  UserSilhouette,
  MediaEmblem,
  SocialIcon,
} from '../index';

describe('Web Brand Components', () => {
  describe('Logo & LogoSymbol', () => {
    it('génère un SVG avec le viewBox et le chemin du symbole Q', () => {
      const html = renderToStaticMarkup(<LogoSymbol className="w-8 h-8" />);
      expect(html).toContain('<svg');
      expect(html).toContain('viewBox="0 0 216 133"');
      expect(html).toContain('class="w-8 h-8"');
      expect(html).toContain('fill="#EE4B2B"');
    });

    it('Logo est un alias direct de LogoSymbol', () => {
      const html = renderToStaticMarkup(<Logo fillColor="#000000" />);
      expect(html).toContain('fill="#000000"');
    });
  });

  describe('LogoWordmark', () => {
    it('génère un SVG avec le viewBox et les lettres complètes', () => {
      const html = renderToStaticMarkup(<LogoWordmark className="h-10" fillColor="#ffffff" />);
      expect(html).toContain('viewBox="540 596 1416 548"');
      expect(html).toContain('fill="#ffffff"');
      expect(html).toContain('fill-rule="evenodd"');
    });
  });

  describe('CertifiedBadge', () => {
    it('génère le badge avec son cercle vermillon et son check blanc', () => {
      const html = renderToStaticMarkup(<CertifiedBadge size={16} title="Vérifié officiel" />);
      expect(html).toContain('width="16"');
      expect(html).toContain('height="16"');
      expect(html).toContain('fill="#EE4B2B"');
      expect(html).toContain('stroke="#FFFFFF"');
      expect(html).toContain('title="Vérifié officiel"');
    });
  });

  describe('MediaBadge', () => {
    it('génère le badge média avec son squircle', () => {
      const html = renderToStaticMarkup(<MediaBadge size={18} />);
      expect(html).toContain('width="18"');
      expect(html).toContain('rx="4"');
      expect(html).toContain('fill="#18181B"');
    });
  });

  describe('UserSilhouette & MediaEmblem', () => {
    it('génère la silhouette humaine avec tête et buste', () => {
      const html = renderToStaticMarkup(
        <UserSilhouette size={24} className="text-muted-foreground" />
      );
      expect(html).toContain('width="24"');
      expect(html).toContain('<circle');
      expect(html).toContain('<path');
    });

    it('génère l’emblème média avec les tracés de presse', () => {
      const html = renderToStaticMarkup(<MediaEmblem size={24} />);
      expect(html).toContain('stroke-width="1.8"');
      expect(html).toContain('<path');
    });
  });

  describe('SocialIcon', () => {
    it('affiche l’icône correspondante pour une plateforme supportée (Bluesky, X, GitHub)', () => {
      const blueskyHtml = renderToStaticMarkup(
        <SocialIcon platform="bluesky" className="w-6 h-6" />
      );
      expect(blueskyHtml).toContain('aria-label="bluesky"');
      expect(blueskyHtml).toContain('class="w-6 h-6"');

      const xHtml = renderToStaticMarkup(<SocialIcon platform="x" />);
      expect(xHtml).toContain('aria-label="x"');

      const githubHtml = renderToStaticMarkup(<SocialIcon platform="GitHub" />);
      expect(githubHtml).toContain('aria-label="GitHub"');
    });

    it('génère un fallback valide en cas de plateforme inconnue', () => {
      const unknownHtml = renderToStaticMarkup(<SocialIcon platform="unknown-network" />);
      expect(unknownHtml).toContain('<circle');
      expect(unknownHtml).toContain('<line');
    });
  });
});
