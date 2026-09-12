import { describe, expect, it } from 'vitest';
import { buildSignupConsent, type ConsentDocument } from '../legal-consent';

const DOCS: ConsentDocument[] = [
  {
    slug: 'conditions-generales-utilisation',
    title: 'CGU',
    version: '2026-01',
    versionId: 'v-cgu',
  },
  {
    slug: 'politique-confidentialite',
    title: 'Confidentialité',
    version: '2026-01',
    versionId: 'v-priv',
  },
];

describe('⚖️ legal-consent — charge utile d’inscription', () => {
  it('épingle la version réellement affichée, pas un numéro symbolique', () => {
    const payload = buildSignupConsent('fr', DOCS, new Date('2026-09-12T10:00:00.000Z'));

    expect(payload).toBeDefined();
    expect(payload?.locale).toBe('fr');
    expect(payload?.at).toBe('2026-09-12T10:00:00.000Z');
    // C'est le versionId qui fait foi côté serveur : sans lui, la preuve
    // retomberait sur « la version publiée du moment », qui peut avoir changé
    // entre l'affichage du formulaire et la création du compte.
    expect(payload?.items).toEqual([
      { slug: 'conditions-generales-utilisation', versionId: 'v-cgu', version: '2026-01' },
      { slug: 'politique-confidentialite', versionId: 'v-priv', version: '2026-01' },
    ]);
  });

  it('ne dépose rien quand aucun document n’exige d’acceptation', () => {
    // Un objet vide dans les métadonnées du compte serait un faux signal
    // « il y avait quelque chose à accepter ».
    expect(buildSignupConsent('fr', [])).toBeUndefined();
  });

  it('reste exploitable pour une locale anglaise', () => {
    const payload = buildSignupConsent('en', DOCS);
    expect(payload?.locale).toBe('en');
    expect(payload?.items).toHaveLength(2);
  });
});
