// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InvertedCurveBanner } from '../notifications/InvertedCurveBanner';

const storageMock: Record<string, string> = {};
beforeEach(() => {
  for (const k in storageMock) delete storageMock[k];
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => storageMock[key] ?? null,
      setItem: (key: string, value: string) => {
        storageMock[key] = value;
      },
      removeItem: (key: string) => {
        delete storageMock[key];
      },
      clear: () => {
        for (const k in storageMock) delete storageMock[k];
      },
    },
    writable: true,
  });
});

describe('InvertedCurveBanner', () => {
  it("affiche le message et le badge de l'annonce", () => {
    render(<InvertedCurveBanner message="Bienvenue sur la version 2.4 !" type="promo" />);
    expect(screen.getByText('Bienvenue sur la version 2.4 !')).toBeDefined();
    expect(screen.getByText('Nouveau')).toBeDefined();
  });

  it("contient les deux fillets concaves inversés pour embrasser l'écran", () => {
    const { container } = render(<InvertedCurveBanner message="Alerte système" type="warning" />);
    const svgs = container.querySelectorAll('svg');
    // Au moins 2 SVGs pour les fillets + icône + croix
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    // Vérification du chemin bezier concave C1
    const hasConcavePath = Array.from(svgs).some(
      (s) => s.innerHTML.includes('Q16,0') || s.innerHTML.includes('Q0,0')
    );
    expect(hasConcavePath).toBe(true);
  });

  it("affiche le lien d'action lorsque configuré", () => {
    render(
      <InvertedCurveBanner
        message="Offre de rentrée"
        linkUrl="/pricing"
        linkText="Souscrire"
        type="promo"
      />
    );
    const link = screen.getByText('Souscrire').closest('a');
    expect(link).toBeDefined();
    expect(link?.getAttribute('href')).toBe('/pricing');
  });

  it('permet de fermer le bandeau et persiste le dismiss en localStorage', () => {
    const onDismiss = vi.fn();
    render(
      <InvertedCurveBanner
        id="ann_2026_09"
        message="Message important"
        dismissible={true}
        onDismiss={onDismiss}
      />
    );

    const closeBtn = screen.getByLabelText("Fermer l'annonce");
    fireEvent.click(closeBtn);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('qoe_dismissed_announcement_ann_2026_09')).toBe('true');
  });

  it('ne rend rien si le message a déjà été ignoré dans le stockage', () => {
    localStorage.setItem('qoe_dismissed_announcement_ann_ignored', 'true');
    const { container } = render(
      <InvertedCurveBanner id="ann_ignored" message="Message déjà vu" />
    );
    expect(container.textContent).toBe('');
  });
});
