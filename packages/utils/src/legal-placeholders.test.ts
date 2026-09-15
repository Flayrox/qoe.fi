import { describe, expect, it } from 'vitest';
import { countLegalPlaceholders, findLegalPlaceholders } from './legal-placeholders';

describe('findLegalPlaceholders', () => {
  it('ne détecte rien dans un document rempli', () => {
    const body =
      '# Mentions légales\n\nÉditeur : **QOE SAS**, 12 rue de la Paix, 75002 Paris.\nContact : dpo@qoe.fi\n';
    expect(findLegalPlaceholders(body)).toEqual([]);
    expect(countLegalPlaceholders(body)).toBe(0);
  });

  it('détecte les jetons à compléter avec ligne et occurrences', () => {
    const body = [
      'Éditeur : [RAISON SOCIALE]',
      'Contact : [EMAIL DPO]',
      'Hébergeur : [HÉBERGEUR PRINCIPAL] et [HÉBERGEUR PRINCIPAL] encore.',
    ].join('\n');
    const found = findLegalPlaceholders(body);
    expect(found.map((p) => p.token)).toEqual([
      '[RAISON SOCIALE]',
      '[EMAIL DPO]',
      '[HÉBERGEUR PRINCIPAL]',
    ]);
    expect(found[0]).toMatchObject({ line: 1, count: 1 });
    expect(found[2]).toMatchObject({ line: 3, count: 2 });
    expect(countLegalPlaceholders(body)).toBe(4);
  });

  it('ignore les liens et images markdown', () => {
    const body =
      'Voir [la politique de confidentialité](/legal/politique-confidentialite) et ![logo](/icon.svg).';
    expect(findLegalPlaceholders(body)).toEqual([]);
  });

  it('ignore les minuscules et les balises courtes', () => {
    const body = 'Du texte normal [et ceci](x) puis [NOTE] et [a].';
    const found = findLegalPlaceholders(body);
    expect(found.map((p) => p.token)).toEqual(['[NOTE]']);
  });

  it('ignore les sigles officiels (CNIL, RGPD)', () => {
    const body = 'Notification à lautorité ([CNIL] ou compétente) conformément au [RGPD].';
    expect(findLegalPlaceholders(body)).toEqual([]);
  });

  it('gère le texte vide', () => {
    expect(findLegalPlaceholders('')).toEqual([]);
  });
});
