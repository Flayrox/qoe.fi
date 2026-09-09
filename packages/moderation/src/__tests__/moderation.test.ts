import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isDisposableEmail,
  validateRegistrationEmail,
  validateUsername,
  normalizeHomoglyphs,
  decodeLeetspeak,
  fastPathScan,
  chunkText,
  detectMagicBytes,
  OpenAiModerator,
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

describe('@qoe/moderation — Fast-Path Text Scan', () => {
  it('laisse passer les textes normaux', () => {
    const res = fastPathScan('Bonjour à tous, voici une excellente analyse sur la géopolitique.');
    expect(res.clean).toBe(true);
    expect(res.action).toBe('allow');
  });

  it('bloque instantanément les menaces de mort directes', () => {
    const res = fastPathScan('je vais te tuer demain');
    expect(res.clean).toBe(false);
    expect(res.action).toBe('block');
  });

  it('bloque les slogans haineux extrêmes', () => {
    const res = fastPathScan('sieg heil à tous');
    expect(res.clean).toBe(false);
    expect(res.action).toBe('block');
  });
});

describe('@qoe/moderation — Text Chunker', () => {
  it('ne découpe pas les textes courts', () => {
    const shortText = 'Ceci est un texte court.';
    const chunks = chunkText(shortText, { chunkSize: 1000 });
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(shortText);
  });

  it('découpe les textes longs avec chevauchement', () => {
    const longText = 'Premier paragraphe.\n\n'.repeat(500); // ~10 500 caractères
    const chunks = chunkText(longText, { chunkSize: 3000, overlap: 300 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].endChar).toBeGreaterThan(0);
  });
});

describe('@qoe/moderation — Magic Bytes Image Guard', () => {
  it('identifie un vrai buffer JPEG', () => {
    const jpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const res = detectMagicBytes(jpegBuffer);
    expect(res.valid).toBe(true);
    expect(res.mime).toBe('image/jpeg');
  });

  it('identifie un vrai buffer PNG', () => {
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const res = detectMagicBytes(pngBuffer);
    expect(res.valid).toBe(true);
    expect(res.mime).toBe('image/png');
  });

  it('rejette un faux fichier texte renommé en image', () => {
    const fakeBuffer = Buffer.from('ceci est un faux fichier binaire image');
    const res = detectMagicBytes(fakeBuffer);
    expect(res.valid).toBe(false);
  });
});

describe('@qoe/moderation — OpenAI Omni-Moderator', () => {
  it('retourne un résultat sain en dev sans clé API', async () => {
    const moderator = new OpenAiModerator({ apiKey: 'sk-mock' });
    const result = await moderator.moderate({ text: 'Texte anodin' });
    expect(result.safe).toBe(true);
    expect(result.flagged).toBe(false);
    expect(result.flags.isCsam).toBe(false);
  });

  it('détecte et traite les violations CSAM et haine depuis la réponse API', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        ({
          ok: true,
          json: async () => ({
            results: [
              {
                flagged: true,
                categories: {
                  'sexual/minors': true,
                  hate: true,
                  violence: false,
                },
                category_scores: {
                  'sexual/minors': 0.99,
                  hate: 0.85,
                },
              },
            ],
          }),
        }) as unknown as Response;

      const moderator = new OpenAiModerator({ apiKey: 'sk-real-test-key-123' });
      const result = await moderator.moderate({ text: 'Violation grave' });
      expect(result.safe).toBe(false);
      expect(result.flagged).toBe(true);
      expect(result.flags.isCsam).toBe(true);
      expect(result.flags.isHate).toBe(true);
      expect(result.flaggedCategories).toContain('sexual/minors');
      expect(result.flaggedCategories).toContain('hate');
      expect(result.reason).toContain('sexual/minors');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('gère les contenus conformes sans faux positifs', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        ({
          ok: true,
          json: async () => ({
            results: [
              {
                flagged: false,
                categories: {},
                category_scores: {},
              },
            ],
          }),
        }) as unknown as Response;

      const moderator = new OpenAiModerator({ apiKey: 'sk-real-test-key-123' });
      const result = await moderator.moderate({ text: 'Article de qualité' });
      expect(result.safe).toBe(true);
      expect(result.flagged).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
