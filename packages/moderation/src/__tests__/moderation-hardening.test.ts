import { describe, expect, it } from 'vitest';
import {
  isDisposableEmail,
  normalizeEmail,
  validateRegistrationEmail,
  validateUsername,
} from '../index';

// =====================================================================
// 🔒 L14 — durcissement @qoe/moderation
// =====================================================================
// Chaque test de cette suite décrit le comportement ATTENDU et échouait
// contre l'implémentation d'origine (voir fiche L14).
// =====================================================================

describe('@qoe/moderation — réservés non contournables (L14)', () => {
  it('refuse les homoglyphes non-ASCII dès le format (première barrière)', () => {
    const attempts = ['mоderator', 'аdmin', 'qое'];
    for (const attempt of attempts) {
      const result = validateUsername(attempt);
      expect(result.valid, `« ${attempt} » devrait être refusé`).toBe(false);
      expect(result.reason).toBe('format');
    }
  });

  it('refuse un réservé déguisé en leetspeak', () => {
    const attempts = ['adm1n', 'm0derator', '5upport'];
    for (const attempt of attempts) {
      const result = validateUsername(attempt);
      expect(result.valid, `« ${attempt} » devrait être refusé`).toBe(false);
      expect(result.reason).toBe('reserved');
    }
  });
});

describe('@qoe/moderation — format email RFC (L14)', () => {
  it('refuse les points en tête, en queue et doublés dans la partie locale', () => {
    for (const email of ['.a@qoe.fi', 'a.@qoe.fi', 'a..b@qoe.fi']) {
      expect(validateRegistrationEmail(email).valid, `« ${email} » devrait être rejeté`).toBe(
        false
      );
    }
  });

  it('refuse une partie locale de plus de 64 caractères', () => {
    const email = `${'a'.repeat(65)}@qoe.fi`;
    expect(validateRegistrationEmail(email).valid).toBe(false);
  });
});

describe('@qoe/moderation — normalisation email et saisies limites (L14)', () => {
  it('normalise une saisie sans arobase sans lever', () => {
    expect(normalizeEmail('  PasUnEmail  ')).toEqual({
      raw: '  PasUnEmail  ',
      normalized: 'pasunemail',
      canonical: 'pasunemail',
      domain: '',
      localPart: 'pasunemail',
      isDisposable: false,
    });
  });

  it('rend les erreurs explicites pour les saisies vides ou trop courtes', () => {
    expect(validateRegistrationEmail('').error).toContain('requise');
    expect(validateRegistrationEmail('a@b').error).toContain('longueur');
    expect(isDisposableEmail('')).toBe(false);
  });
});
