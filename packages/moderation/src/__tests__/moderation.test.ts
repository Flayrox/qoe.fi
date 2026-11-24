import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isDisposableEmail,
  validateRegistrationEmail,
  validateUsername,
  normalizeHomoglyphs,
  decodeLeetspeak,
} from '../index';

describe('@qoe/moderation — Email Guard', () => {
  it('détecte les adresses email jetables connues', () => {
    expect(isDisposableEmail('test@yopmail.com')).toBe(true);
    expect(isDisposableEmail('user@mailinator.com')).toBe(true);
    expect(isDisposableEmail('spammer@temp-mail.org')).toBe(true);
    expect(isDisposableEmail('bot@sub.yopmail.fr')).toBe(true);
    expect(isDisposableEmail('valid.user@gmail.com')).toBe(false);
    expect(isDisposableEmail('contact@qoe.fi')).toBe(false);
  });

  it('normalise les alias et points Gmail pour le calcul canonique', () => {
    const res1 = normalizeEmail('John.Doe+newsletter@gmail.com');
    expect(res1.canonical).toBe('johndoe@gmail.com');

    const res2 = normalizeEmail('j.o.h.n@googlemail.com');
    expect(res2.canonical).toBe('john@gmail.com');
  });

  it('valide ou rejette les emails à linscription', () => {
    const ok = validateRegistrationEmail('author@qoe.fi');
    expect(ok.valid).toBe(true);

    const badDisposable = validateRegistrationEmail('fraud@sharklasers.com');
    expect(badDisposable.valid).toBe(false);
    expect(badDisposable.error).toContain('jetables');

    const badFormat = validateRegistrationEmail('invalid-email');
    expect(badFormat.valid).toBe(false);
  });
});

describe('@qoe/moderation — Identity & Username Guard', () => {
  it('valide les pseudos conformes', () => {
    expect(validateUsername('alice_99').valid).toBe(true);
    expect(validateUsername('marc-antoine').valid).toBe(true);
    expect(validateUsername('journaliste.pro').valid).toBe(true);
  });

  it('rejette les longueurs incorrectes et caractères interdits', () => {
    expect(validateUsername('al').valid).toBe(false); // trop court
    expect(validateUsername('a'.repeat(31)).valid).toBe(false); // trop long
    expect(validateUsername('-starts-with-dash').valid).toBe(false);
    expect(validateUsername('ends-with-dot.').valid).toBe(false);
  });

  it('bloque les pseudos réservés pour la plateforme', () => {
    expect(validateUsername('admin').valid).toBe(false);
    expect(validateUsername('qoe').valid).toBe(false);
    expect(validateUsername('official').valid).toBe(false);
    expect(validateUsername('moderator').valid).toBe(false);
  });

  it('bloque les pseudos haineux et extrémistes', () => {
    expect(validateUsername('nazi_supporter').valid).toBe(false);
    expect(validateUsername('hitler1488').valid).toBe(false);
  });

  it('déjoue les tentatives de contournement par leetspeak', () => {
    expect(decodeLeetspeak('h1tl3r')).toBe('hitler');
    expect(validateUsername('h1tl3r').valid).toBe(false);
    expect(validateUsername('n4z1').valid).toBe(false);
  });

  it('déjoue les homoglyphes Cyrilliques', () => {
    // Cyrillique "а" (U+0430) au lieu de ASCII 'a'
    const homoglyph = 'nаzi';
    expect(normalizeHomoglyphs(homoglyph)).toBe('nazi');
    expect(validateUsername(homoglyph).valid).toBe(false);
  });
});
