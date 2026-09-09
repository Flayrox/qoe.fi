import { describe, it, expect } from 'vitest';
import { DEFAULT_AVATARS, getDefaultAvatar, isDefaultAvatarUrl } from '../avatars';

describe('DEFAULT_AVATARS registry', () => {
  it('contient exactement 10 avatars par défaut', () => {
    expect(DEFAULT_AVATARS.length).toBe(10);
  });

  it('chaque avatar possède des métadonnées complètes et valides', () => {
    DEFAULT_AVATARS.forEach((avatar, index) => {
      expect(avatar.id).toBe(index + 1);
      expect(avatar.filename).toBe(`avatar-${index + 1}.svg`);
      expect(avatar.publicPath).toBe(`/avatars/avatar-${index + 1}.svg`);
      expect(avatar.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(avatar.alt.length).toBeGreaterThan(5);
    });
  });
});

describe('getDefaultAvatar helper', () => {
  it('récupère un avatar par index numérique valide', () => {
    const a1 = getDefaultAvatar(1);
    expect(a1.id).toBe(1);
    expect(a1.filename).toBe('avatar-1.svg');

    const a5 = getDefaultAvatar(5);
    expect(a5.id).toBe(5);
  });

  it('récupère un avatar par chaîne numérique', () => {
    const a3 = getDefaultAvatar('3');
    expect(a3.id).toBe(3);
  });

  it('clamp les valeurs inférieures à 1 vers 1', () => {
    const a0 = getDefaultAvatar(0);
    expect(a0.id).toBe(1);

    const aNegative = getDefaultAvatar(-5);
    expect(aNegative.id).toBe(1);
  });

  it('clamp les valeurs supérieures à 10 vers 10', () => {
    const a100 = getDefaultAvatar(100);
    expect(a100.id).toBe(10);
  });

  it('renvoie le premier avatar pour une entrée invalide', () => {
    const aNaN = getDefaultAvatar('invalid');
    expect(aNaN.id).toBe(1);
  });
});

describe('isDefaultAvatarUrl helper', () => {
  it('identifie correctement les URLs d’avatars par défaut', () => {
    expect(isDefaultAvatarUrl('/avatars/avatar-1.svg')).toBe(true);
    expect(isDefaultAvatarUrl('/avatars/avatar-10.svg')).toBe(true);
    expect(isDefaultAvatarUrl(' /avatars/avatar-5.svg ')).toBe(true);
  });

  it('rejette les URLs hors périmètre ou invalides', () => {
    expect(isDefaultAvatarUrl('/avatars/avatar-11.svg')).toBe(false);
    expect(isDefaultAvatarUrl('/avatars/avatar-0.svg')).toBe(false);
    expect(isDefaultAvatarUrl('https://example.com/avatar.png')).toBe(false);
    expect(isDefaultAvatarUrl(null)).toBe(false);
    expect(isDefaultAvatarUrl(undefined)).toBe(false);
    expect(isDefaultAvatarUrl('')).toBe(false);
  });
});
