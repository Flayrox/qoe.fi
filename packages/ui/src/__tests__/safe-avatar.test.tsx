// @vitest-environment jsdom
// =====================================================================
// 🛡️ SafeAvatar — la forme est une règle, pas un className d'appelant
// =====================================================================
// 📖 Trois garanties que le produit doit tenir partout : une personne est
//    ronde, un média est un carré à petits coins arrondis, et une URL morte
//    ne laisse jamais une image brisée.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { SafeAvatar } from '../SafeAvatar';
import { PreviewableUserAvatar } from '../ui/PreviewableUserAvatar';

const avatar = () => document.querySelector<HTMLElement>('[data-avatar]')!;

describe('SafeAvatar — forme selon la nature du compte', () => {
  it('dessine une personne en cercle', () => {
    render(<SafeAvatar name="Lila" username="lila" type="PERSONAL" />);

    expect(avatar().getAttribute('data-avatar-shape')).toBe('circle');
    expect(avatar().getAttribute('data-avatar-entity')).toBe('person');
    expect(avatar().className).toContain('rounded-full');
  });

  it('dessine un média en carré à petits coins arrondis, à toutes les tailles', () => {
    const { rerender } = render(
      <SafeAvatar name="Camille" username="camille" type="MEDIA" size={24} />
    );

    expect(avatar().getAttribute('data-avatar-shape')).toBe('square');
    expect(avatar().getAttribute('data-avatar-entity')).toBe('media');
    expect(avatar().className).toContain('rounded-[var(--radius-sm)]');
    expect(avatar().className).not.toContain('rounded-full');

    // Le rayon ne dépend pas de la taille : un média de 96 px reste le même
    // carré, pas un panneau arrondi.
    rerender(<SafeAvatar name="Camille" username="camille" type="MEDIA" size={96} />);
    expect(avatar().className).toContain('rounded-[var(--radius-sm)]');
  });

  it('laisse une forme explicite primer sur la nature du compte', () => {
    render(<SafeAvatar name="Camille" type="MEDIA" shape="circle" />);

    expect(avatar().getAttribute('data-avatar-shape')).toBe('circle');
    expect(avatar().className).toContain('rounded-full');
  });

  it('ne laisse pas un className rounded-full contredire la nature média', () => {
    render(<SafeAvatar name="Camille" type="MEDIA" className="rounded-full shadow-md" />);

    expect(avatar().className).toContain('rounded-[var(--radius-sm)]');
    expect(avatar().className).not.toContain('rounded-full');
    // Le reste du style de l’appelant est conservé.
    expect(avatar().className).toContain('shadow-md');
  });

  it('accepte l’alias historique « squircle » sans changer la forme', () => {
    render(<SafeAvatar name="Camille" type="MEDIA" shape="squircle" />);

    expect(avatar().getAttribute('data-avatar-shape')).toBe('square');
    expect(avatar().className).toContain('rounded-[var(--radius-sm)]');
  });
});

describe('SafeAvatar — repli', () => {
  it('affiche la silhouette et une teinte déterministe quand il n’y a pas d’image', () => {
    render(<SafeAvatar name="Lila" username="lila" type="PERSONAL" />);

    expect(avatar().getAttribute('role')).toBe('img');
    expect(avatar().getAttribute('aria-label')).toBe('Lila');
    expect(avatar().style.getPropertyValue('--avatar-bg-light')).not.toBe('');
  });

  it('porte la même règle dans l’avatar d’auteur et la carte de survol', () => {
    render(
      <PreviewableUserAvatar
        user={{
          id: 'media-camille',
          name: 'Camille',
          username: 'camille',
          logoUrl: null,
          type: 'MEDIA',
        }}
        size="sm"
      />
    );

    expect(avatar().getAttribute('data-avatar-shape')).toBe('square');
    expect(document.querySelector('[data-slot="hover-card-trigger"]')).not.toBeNull();
  });

  it('bascule sur le repli quand l’image casse', () => {
    render(
      <SafeAvatar name="Lien cassé" username="casse" src="/avatars/introuvable.svg" type="MEDIA" />
    );

    const image = document.querySelector('img')!;
    expect(image).not.toBeNull();

    fireEvent.error(image);

    const fallback = avatar();
    expect(fallback.tagName).toBe('SPAN');
    expect(fallback.getAttribute('aria-label')).toBe('Lien cassé');
    expect(fallback.getAttribute('data-avatar-shape')).toBe('square');
    expect(fallback.getAttribute('data-avatar-entity')).toBe('media');
    expect(document.querySelector('img')).toBeNull();
  });
});
