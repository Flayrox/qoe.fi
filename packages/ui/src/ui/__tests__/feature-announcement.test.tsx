import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  FEATURES,
  FEATURE_KEYS,
  FEATURE_STATUS_COPY,
  getFeature,
  isFeatureKey,
  localize,
} from '../feature-catalog';
import { UpcomingBadge, FeatureTeaser } from '../feature-teaser';
import {
  FeatureAnnouncementProvider,
  FeatureInterstitial,
  useFeatureAnnouncement,
} from '../feature-interstitial';

const PLACEHOLDER = /^(à compléter|todo|lorem)/i;

describe('catalogue des fonctionnalités', () => {
  it('expose des clés stables, uniques et conformes au contrat de persistance', () => {
    expect(FEATURE_KEYS.length).toBeGreaterThan(0);
    for (const key of FEATURE_KEYS) {
      expect(getFeature(key)?.key).toBe(key);
      // Même expression que la contrainte CHECK de la table FeatureSignal.
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(isFeatureKey('custom-domain')).toBe(true);
    expect(isFeatureKey('domaine-personnalise')).toBe(false);
    expect(getFeature('inconnue')).toBeUndefined();
  });

  it('fournit systématiquement la copie FR et EN, sans texte provisoire', () => {
    for (const key of FEATURE_KEYS) {
      const feature = FEATURES[key];
      const texts = [
        feature.copy.label,
        feature.copy.title,
        feature.copy.summary,
        feature.copy.availability,
        feature.copy.ctaLabel,
        ...feature.copy.details,
      ];
      for (const text of texts) {
        for (const locale of ['fr', 'en'] as const) {
          expect(text[locale]?.trim().length, `${key}.${locale}`).toBeGreaterThan(0);
          expect(text[locale]).not.toMatch(PLACEHOLDER);
        }
      }
      expect(feature.copy.details.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('garde les statuts et paliers cohérents', () => {
    for (const key of FEATURE_KEYS) {
      const feature = FEATURES[key];
      if (feature.status === 'pro') expect(feature.plan).toBe('pro');
      if (feature.cta === 'upgrade') expect(feature.plan).toBe('pro');
      expect(FEATURE_STATUS_COPY[feature.status].label.fr.length).toBeGreaterThan(0);
      expect(FEATURE_STATUS_COPY[feature.status].label.en.length).toBeGreaterThan(0);
    }
  });

  it('replie sur le français quand la locale est inconnue', () => {
    const text = { fr: 'Bientôt', en: 'Soon' };
    // @ts-expect-error — on vérifie volontairement une locale hors contrat.
    expect(localize(text, 'es')).toBe('Bientôt');
  });
});

describe('UpcomingBadge', () => {
  it('est un vrai bouton qui ouvre l’annonce, et reste un texte hors provider', () => {
    const { rerender } = render(
      <FeatureAnnouncementProvider locale="fr">
        <UpcomingBadge feature="custom-domain" />
      </FeatureAnnouncementProvider>
    );
    const button = screen.getByRole('button', { name: /bientôt/i });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');

    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Domaine personnalisé')).toBeTruthy();

    // Hors provider : pas d'action fantôme, le badge redevient un texte.
    rerender(<UpcomingBadge feature="custom-domain" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('respecte la locale anglaise', () => {
    render(<UpcomingBadge feature="custom-domain" locale="en" interactive={false} />);
    expect(screen.getByText('Soon')).toBeTruthy();
  });
});

describe('FeatureTeaser', () => {
  it('rend le contenu visible mais réellement inerte', () => {
    render(
      <FeatureAnnouncementProvider locale="fr">
        <FeatureTeaser feature="custom-domain">
          <input aria-label="domaine" defaultValue="journal.exemple.fr" />
        </FeatureTeaser>
      </FeatureAnnouncementProvider>
    );

    const input = screen.getByLabelText('domaine');
    expect(input.closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /en savoir plus/i })).toBeTruthy();
  });

  it('ouvre la même annonce que le badge', () => {
    render(
      <FeatureAnnouncementProvider locale="fr">
        <FeatureTeaser feature="email-customization" />
      </FeatureAnnouncementProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /en savoir plus/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Personnalisation des emails')).toBeTruthy();
  });
});

describe('FeatureInterstitial', () => {
  it('émet une seule vue par ouverture et enregistre « me prévenir »', async () => {
    const onSignal = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <FeatureInterstitial
        featureKey="custom-domain"
        open
        onOpenChange={() => {}}
        onSignal={onSignal}
      />
    );

    await waitFor(() =>
      expect(onSignal).toHaveBeenCalledWith({ feature: 'custom-domain', kind: 'view' })
    );

    fireEvent.click(screen.getByRole('button', { name: /me prévenir/i }));
    await waitFor(() =>
      expect(onSignal).toHaveBeenCalledWith({ feature: 'custom-domain', kind: 'notify' })
    );
    expect(await screen.findByText('C’est noté')).toBeTruthy();

    // Fermeture puis réouverture : une nouvelle vue, jamais deux pour la même.
    rerender(
      <FeatureInterstitial
        featureKey="custom-domain"
        open={false}
        onOpenChange={() => {}}
        onSignal={onSignal}
      />
    );
    rerender(
      <FeatureInterstitial
        featureKey="custom-domain"
        open
        onOpenChange={() => {}}
        onSignal={onSignal}
      />
    );
    await waitFor(() => {
      const views = onSignal.mock.calls.filter(([signal]) => signal.kind === 'view');
      expect(views).toHaveLength(2);
    });
  });

  it('affiche une erreur actionnable si l’enregistrement échoue', async () => {
    const onSignal = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <FeatureInterstitial
        featureKey="custom-domain"
        open
        onOpenChange={() => {}}
        onSignal={onSignal}
      />
    );

    // La vue échoue en silence : l'annonce reste lisible.
    expect(await screen.findByText('Domaine personnalisé')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /me prévenir/i }));
    expect((await screen.findByRole('status')).textContent).toMatch(/réessayez/i);
    expect(
      (screen.getByRole('button', { name: /me prévenir/i }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('renvoie vers l’offre Pro pour une fonctionnalité payante', () => {
    render(
      <FeatureInterstitial
        featureKey="email-customization"
        open
        onOpenChange={() => {}}
        pricingHref="/tarifs"
      />
    );
    const link = screen.getByRole('link', { name: /découvrir l’offre pro/i });
    expect(link.getAttribute('href')).toBe('/tarifs');
  });

  it('ne rend rien pour une clé inconnue (pas de crash)', () => {
    const { container } = render(
      <FeatureInterstitial
        // @ts-expect-error — robustesse face à une clé retirée du registre.
        featureKey="fonctionnalite-supprimee"
        open
        onOpenChange={() => {}}
      />
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('FeatureAnnouncementProvider', () => {
  it('se souvient d’une demande envoyée après fermeture de l’annonce', async () => {
    const onSignal = vi.fn().mockResolvedValue(undefined);
    render(
      <FeatureAnnouncementProvider locale="fr" onSignal={onSignal}>
        <UpcomingBadge feature="custom-domain" />
      </FeatureAnnouncementProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /bientôt/i }));
    fireEvent.click(screen.getByRole('button', { name: /me prévenir/i }));
    expect(await screen.findByText('C’est noté')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /plus tard/i }));
    fireEvent.click(screen.getByRole('button', { name: /bientôt/i }));

    const done = screen.getByRole('button', { name: /c’est noté/i }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
  });
});

describe('useFeatureAnnouncement', () => {
  it('reste utilisable hors provider', () => {
    function Probe() {
      const { activeFeature, open, close } = useFeatureAnnouncement();
      open('custom-domain');
      close();
      return <span data-testid="probe">{String(activeFeature)}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('null');
  });
});
