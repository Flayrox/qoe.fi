import { describe, expect, it } from 'vitest';
import {
  MAX_EMAIL_LENGTH,
  MAX_SLUG_LENGTH,
  articleTitleSchema,
  centsSchema,
  createReportSchema,
  createThoughtSchema,
  emailSchema,
  idSchema,
  normalizeUsername,
  postContentSchema,
  replyToPostSchema,
  slugSchema,
  updateProfileSchema,
  usernameSchema,
  uuidSchema,
} from '../index';

// Chaque cas ci-dessous est une entrée qui a déjà produit (ou produirait) un
// défaut réel : XSS, injection de requête, date refusée par Go après un
// aller-retour réseau, ou simple divergence avec la règle serveur.
describe('@qoe/schemas — durcissement', () => {
  describe('imageUrl : la valeur part directement dans <img src>', () => {
    it('refuse javascript:, data: et les formes protocol-relative', () => {
      for (const bad of [
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD4=',
        '//evil.com/pixel.png',
        '/\\evil.com/pixel.png',
        'blob:https://qoe.fi/1234',
        'https://cdn.qoe.fi/a b.png',
      ]) {
        expect(() => createThoughtSchema.parse({ imageUrl: bad }), bad).toThrow();
      }
    });

    it('refuse un tableau JSON contenant une seule entrée dangereuse', () => {
      expect(() =>
        createThoughtSchema.parse({
          imageUrl: JSON.stringify(['https://ok.test/a.png', 'javascript:1']),
        })
      ).toThrow();
      expect(() =>
        createThoughtSchema.parse({ imageUrl: '[{"url":"https://x.test/a.png"}]' })
      ).toThrow();
      expect(() => createThoughtSchema.parse({ imageUrl: '[]' })).toThrow(); // rien à publier
      expect(() => createThoughtSchema.parse({ imageUrl: '[' })).toThrow(); // JSON invalide
    });

    it('refuse plus de 8 images sur une pensée', () => {
      const nine = JSON.stringify(Array.from({ length: 9 }, (_, i) => `https://x.test/${i}.png`));
      expect(() => createThoughtSchema.parse({ imageUrl: nine })).toThrow();
    });

    it('accepte les URLs http(s), les chemins racine et les formes vides', () => {
      expect(createThoughtSchema.parse({ imageUrl: 'https://cdn.qoe.fi/img.png' }).imageUrl).toBe(
        'https://cdn.qoe.fi/img.png'
      );
      expect(createThoughtSchema.parse({ imageUrl: '/uploads/a.webp' }).imageUrl).toBe(
        '/uploads/a.webp'
      );
      expect(
        createThoughtSchema.parse({ imageUrl: JSON.stringify(['https://a.test/1.png']) }).imageUrl
      ).toBe('["https://a.test/1.png"]');
      // Une pensée sans texte reste valide grâce au repost ; `null` et la
      // chaîne « null » viennent des anciens clients.
      expect(createThoughtSchema.parse({ imageUrl: null, repostId: 'r-1' }).imageUrl).toBeNull();
      expect(createThoughtSchema.parse({ imageUrl: 'null', repostId: 'r-1' }).imageUrl).toBe(
        'null'
      );
    });
  });

  describe('scheduledAt : doit être accepté par time.Parse(RFC3339) côté Go', () => {
    it('accepte une date avec fuseau', () => {
      expect(
        createThoughtSchema.parse({ content: 'x', scheduledAt: '2026-12-01T10:00:00.000Z' })
          .scheduledAt
      ).toBe('2026-12-01T10:00:00.000Z');
      expect(
        createThoughtSchema.parse({ content: 'x', scheduledAt: '2026-12-01T10:00:00+02:00' })
          .scheduledAt
      ).toBe('2026-12-01T10:00:00+02:00');
      expect(createThoughtSchema.parse({ content: 'x', scheduledAt: null }).scheduledAt).toBeNull();
    });

    it('refuse une date sans fuseau ou illisible', () => {
      for (const bad of ['demain', '2026-12-01T10:00:00', '2026-13-01T00:00:00Z', '17/12/2026']) {
        expect(() => createThoughtSchema.parse({ content: 'x', scheduledAt: bad }), bad).toThrow();
      }
    });
  });

  describe('identifiants', () => {
    it('borne et restreint le charset des identifiants', () => {
      expect(idSchema.parse('123e4567-e89b-12d3-a456-426614174000')).toBeTruthy();
      for (const bad of ['a b', '<script>', 'a/b', 'a'.repeat(65), '']) {
        expect(() => idSchema.parse(bad), bad).toThrow();
      }
    });

    it('refuse un parentId ou un targetId forgé', () => {
      expect(() => createThoughtSchema.parse({ content: 'x', parentId: 'a b' })).toThrow();
      expect(() => createThoughtSchema.parse({ content: 'x', repostId: '<svg>' })).toThrow();
      expect(() => replyToPostSchema.parse({ postId: 'x/y', content: 'ok' })).toThrow();
      expect(() => createReportSchema.parse({ targetId: '' })).toThrow();
    });
  });

  describe('contenus et tags', () => {
    it("n'exige pas de champ content pour une pensée média ou une réponse", () => {
      const media = createThoughtSchema.parse({ imageUrl: 'https://cdn.qoe.fi/a.png' });
      expect(media.content).toBe('');
      const reply = createThoughtSchema.parse({ parentId: 'p-1' });
      expect(reply.content).toBe('');
    });

    it('refuse les caractères de contrôle et les marques bidi', () => {
      expect(() => postContentSchema.parse('a\u0000b')).toThrow();
      expect(() => postContentSchema.parse('titre\u202egnp.exe')).toThrow();
      expect(() => createThoughtSchema.parse({ content: 'a\u202eb' })).toThrow();
      expect(postContentSchema.parse('ligne 1\nligne 2\tok')).toBe('ligne 1\nligne 2\tok');
    });

    it('dédoublonne les tags sans tenir compte de la casse', () => {
      const parsed = createThoughtSchema.parse({
        content: 'x',
        tags: ['#Actu', '#actu', 'Tech', 'tech '],
      });
      expect(parsed.tags).toEqual(['#Actu', 'Tech']);
    });

    it('refuse un tag vide, trop long ou porteur de balises', () => {
      expect(() => createThoughtSchema.parse({ content: 'x', tags: [''] })).toThrow();
      expect(() => createThoughtSchema.parse({ content: 'x', tags: ['<b>'] })).toThrow();
      expect(() => createThoughtSchema.parse({ content: 'x', tags: ['a'.repeat(41)] })).toThrow();
      expect(() =>
        createThoughtSchema.parse({
          content: 'x',
          tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
        })
      ).toThrow();
    });

    it('refuse un triggerWarning multi-ligne', () => {
      expect(() =>
        createThoughtSchema.parse({ content: 'x', triggerWarning: 'violence\ncontenu' })
      ).toThrow();
    });
  });

  describe('profil : une seule règle username, alignée sur Go', () => {
    it('normalise @, la casse et les espaces', () => {
      expect(normalizeUsername('  @Alice_99 ')).toBe('alice_99');
      expect(usernameSchema.parse('  @Alice_99 ')).toBe('alice_99');
    });

    it('refuse les formes que identifier.ValidUsername refuse', () => {
      for (const bad of ['bob-dev', 'a'.repeat(25), 'a..b', 'alice__bob', '_alice', 'alice.']) {
        expect(() => usernameSchema.parse(bad), bad).toThrow();
      }
      expect(usernameSchema.parse('bob.dev')).toBe('bob.dev');
    });

    it('refuse un nom avec retour à la ligne et une URL piégée', () => {
      expect(() =>
        updateProfileSchema.parse({ name: 'Alice\nAdmin', username: 'alice' })
      ).toThrow();
      for (const badUrl of [
        'javascript:alert(1)',
        'https://user:pass@cdn.qoe.fi/a.png',
        'https://cdn.qoe.fi/a b.png',
        '//evil.com/a.png',
      ]) {
        expect(
          () => updateProfileSchema.parse({ name: 'Alice', username: 'alice', logoUrl: badUrl }),
          badUrl
        ).toThrow();
      }
      expect(
        updateProfileSchema.parse({
          name: 'Alice',
          username: 'alice',
          heroText: 'Journaliste.\nBasée à Paris.',
        }).heroText
      ).toBe('Journaliste.\nBasée à Paris.');
    });
  });

  describe('primitifs bornés', () => {
    it('borne les emails à la limite RFC', () => {
      expect(MAX_EMAIL_LENGTH).toBe(254);
      expect(() => emailSchema.parse(`${'a'.repeat(250)}@b.co`)).toThrow();
      expect(emailSchema.parse('  User@Example.COM ')).toBe('user@example.com');
    });

    it('aligne la borne de slug sur slugify', () => {
      expect(MAX_SLUG_LENGTH).toBe(96);
      expect(slugSchema.parse('a'.repeat(96))).toHaveLength(96);
      expect(() => slugSchema.parse('a'.repeat(97))).toThrow();
      expect(slugSchema.parse('  mon-slug  ')).toBe('mon-slug');
    });

    it('normalise la casse des UUID', () => {
      expect(uuidSchema.parse('123E4567-E89B-12D3-A456-426614174000')).toBe(
        '123e4567-e89b-12d3-a456-426614174000'
      );
      expect(() => uuidSchema.parse('123e4567-e89b-12d3-a456-42661417400')).toThrow();
    });

    it('refuse un titre porteur de caractère de contrôle', () => {
      expect(() => articleTitleSchema.parse('Titre\u0007')).toThrow();
      expect(articleTitleSchema.parse('  Mon titre  ')).toBe('Mon titre');
    });

    it('refuse un montant non entier ou hors bornes', () => {
      expect(centsSchema.parse(0)).toBe(0);
      for (const bad of [-1, 1.5, Number.NaN, 2_000_000_00]) {
        expect(() => centsSchema.parse(bad), String(bad)).toThrow();
      }
    });

    it("ramène des détails de signalement vides à l'absence de détail", () => {
      expect(createReportSchema.parse({ targetId: 't-1', details: '   ' }).details).toBeUndefined();
      expect(createReportSchema.parse({ targetId: 't-1', details: 'spam' }).details).toBe('spam');
    });
  });
});
