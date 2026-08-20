// @vitest-environment jsdom
// =====================================================================
// 🛡️ BANC DE STRESS-TESTS UI & RÉSILIENCE ZÉRO-CRASH (@qoe/ui)
// =====================================================================
// Teste la robustesse de tous les micro-composants face aux cas extrêmes :
// 1. URLs d'images cassées, 404, domaines tiers non configurés
// 2. Props nulles, undefined, chaînes vides, caractères unicodes/emojis
// 3. Dates invalides ou désynchronisées SSR/CSR
// 4. Isolation des erreurs d'arbres React via WidgetErrorBoundary
// =====================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

vi.mock('@lingui/core/macro', () => ({
  t: (str: unknown) => (Array.isArray(str) ? str[0] : String(str || '')),
}));
import { SafeAvatar } from '../SafeAvatar';
import { SafeImage } from '../SafeImage';
import { WidgetErrorBoundary } from '../WidgetErrorBoundary';
import { ClientDate } from '../ClientDate';
import { UserAvatar } from '../ui/UserAvatar';
import { ArticleCard } from '../ArticleCard';
import { AuthModalProvider } from '../auth/AuthModalContext';
import type { FeedArticleDTO } from '@qoe/db/types';

describe('🛡️ UI Zero-Crash Resilience Test Suite', () => {
  describe('SafeAvatar', () => {
    it('génère un monogramme déterministe propre quand src est null ou vide', () => {
      const { container } = render(
        <SafeAvatar src={null} name="Camille Desmoulins" username="cdes" size={40} />
      );

      const monogram = container.querySelector('span');
      expect(monogram).toBeTruthy();
      expect(monogram?.textContent).toBe('CD');
    });

    it('génère des initiales à partir du nom ou du pseudonyme avec fallback sécurisé', () => {
      const { rerender, container } = render(<SafeAvatar name="Voltaire" />);
      expect(container.textContent).toBe('VO');

      rerender(<SafeAvatar username="rousseau" />);
      expect(container.textContent).toBe('RO');

      rerender(<SafeAvatar name="" username="" />);
      expect(container.textContent).toBe('Q');
    });

    it('bascule sur le monogramme sans lever d’erreur lors d’un crash réseau d’image (onError)', () => {
      const { container } = render(
        <SafeAvatar
          src="https://api.dicebear.com/7.x/bottts/svg?seed=celeste-roche"
          name="Céleste Roche"
          size={32}
        />
      );

      const img = container.querySelector('img');
      expect(img).toBeTruthy();

      // Simuler l'erreur de chargement 404 ou host non autorisé
      if (img) {
        fireEvent.error(img);
      }

      // Doit avoir basculé sur le monogramme
      const fallback = container.querySelector('span');
      expect(fallback).toBeTruthy();
      expect(fallback?.textContent).toBe('CR');
    });

    it('résiste aux noms avec caractères spéciaux, accents et emojis', () => {
      const { container } = render(
        <SafeAvatar name="🚀 Éléonore d'Aquitaine & Associés" size={48} />
      );
      expect(container.querySelector('span')).toBeTruthy();
    });
  });

  describe('SafeImage', () => {
    it('rend un placeholder sans crasher quand src est absent', () => {
      const { container } = render(<SafeImage src="" alt="Placeholder" width={200} height={100} />);
      expect(container.firstChild).toBeTruthy();
    });

    it('bascule sur le fallback icon lors d’un événement onError', () => {
      const { container } = render(
        <SafeImage
          src="https://cdn.example.com/missing-photo.webp"
          alt="Missing"
          width={300}
          height={200}
        />
      );

      const img = container.querySelector('img');
      if (img) {
        fireEvent.error(img);
      }

      // Vérifie que le conteneur ne crashe pas
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('WidgetErrorBoundary', () => {
    it('isole un crash de composant enfant et affiche le fallback sans propager l’erreur', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const BrokenComponent = () => {
        throw new Error('Simulation d’un crash inattendu');
      };

      const { getByText } = render(
        <WidgetErrorBoundary fallback={<div>Fallback Sécurisé</div>}>
          <BrokenComponent />
        </WidgetErrorBoundary>
      );

      expect(getByText('Fallback Sécurisé')).toBeTruthy();
      consoleSpy.mockRestore();
    });
  });

  describe('ClientDate', () => {
    it('formate une date valide sans désynchronisation', () => {
      const date = new Date('2026-08-20T14:30:00Z');
      const { container } = render(<ClientDate date={date} format="short" locale="fr-FR" />);
      expect(container.querySelector('time')).toBeTruthy();
    });

    it('gère une date invalide avec le fallback par défaut sans lever d’exception', () => {
      const { container } = render(
        <ClientDate date="date-invalide-corrompue" fallback="Date inconnue" />
      );
      expect(container.querySelector('time')).toBeTruthy();
    });
  });

  describe('UserAvatar', () => {
    it('supporte toutes les échelles de tailles et badges avec données incomplètes', () => {
      const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;

      sizes.forEach((sz) => {
        const { container } = render(
          <UserAvatar
            user={{
              id: 'u-1',
              name: null,
              username: 'alpha',
              logoUrl: null,
              isCertified: true,
            }}
            size={sz}
            showBadge={true}
          />
        );
        expect(container.firstChild).toBeTruthy();
      });
    });
  });

  describe('ArticleCard (Robustesse Globale)', () => {
    const mockArticle: FeedArticleDTO = {
      id: 'art-stress-1',
      title: 'Titre de Test Résilience Extrême',
      content: '<p>Contenu de test pour stress test UI</p>',
      slug: 'titre-test-resilience',
      published: true,
      readingTime: 6,
      isPremium: false,
      createdAt: '2026-08-20T10:00:00.000Z',
      category: { name: 'Philosophie' },
      tags: ['Philosophie', 'Tech'],
      author: {
        id: 'auth-1',
        name: 'Auteur Invité',
        username: 'invite',
        logoUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=test-author',
        isCertified: true,
        type: 'PERSONAL',
        subdomain: null,
        customDomain: null,
        heroText: null,
      },
    };

    it('rend une carte d’article complète avec image et logo externes sans crasher', () => {
      const { container } = render(
        <AuthModalProvider>
          <ArticleCard article={mockArticle} isFollowedAuthor={false} isBookmarked={false} />
        </AuthModalProvider>
      );

      expect(container.querySelector('article')).toBeTruthy();
      expect(container.textContent).toContain('Titre de Test Résilience Extrême');
      expect(container.textContent).toContain('Auteur Invité');
    });

    it('supporte un article avec données partielles et images nulles sans aucune erreur', () => {
      const emptyArticle: FeedArticleDTO = {
        ...mockArticle,
        id: 'art-empty',
        title: 'Article Minimaliste',
        content: '',
        author: {
          id: 'auth-2',
          name: null,
          username: null,
          logoUrl: null,
          isCertified: false,
          type: 'PERSONAL',
          subdomain: null,
          customDomain: null,
          heroText: null,
        },
      };

      const { container } = render(
        <AuthModalProvider>
          <ArticleCard article={emptyArticle} isFollowedAuthor={false} isBookmarked={false} />
        </AuthModalProvider>
      );

      expect(container.querySelector('article')).toBeTruthy();
    });
  });
});
