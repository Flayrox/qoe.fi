import { describe, expect, it } from 'vitest';
import { analyzePublishReadiness, countInvalidLinks, countWordsInHtml } from '../preflight';

const validInput = {
  title: 'Une enquête sur les lisières',
  slug: 'une-enquete-sur-les-lisieres',
  contentHtml: `<p>${'Un paragraphe solide. '.repeat(40)}</p><img src="/a.jpg" alt="Une lisière">`,
  imageUrl: 'https://cdn.qoe.fi/cover.jpg',
  coverAlt: 'Une forêt au crépuscule',
  seoTitle: 'Une enquête sur les lisières',
  seoDescription: 'Reportage sur les lisières.',
};

describe('preflight', () => {
  it('accepte un article complet', () => {
    const result = analyzePublishReadiness(validInput);
    expect(result.ready).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
  });

  it('bloque un article sans titre ou sans contenu, pas un texte court', () => {
    const result = analyzePublishReadiness({ ...validInput, title: '', contentHtml: '' });
    expect(result.ready).toBe(false);
    expect(result.errors).toBe(2);
    expect(result.checks.find((check) => check.id === 'title')?.status).toBe('error');
    expect(result.checks.find((check) => check.id === 'content')?.status).toBe('error');

    const short = analyzePublishReadiness({ ...validInput, contentHtml: '<p>Court</p>' });
    expect(short.ready).toBe(true);
    expect(short.checks.find((check) => check.id === 'content')?.status).toBe('warning');
  });

  it('avertit sur les alt manquants et la couverture sans description', () => {
    const result = analyzePublishReadiness({
      ...validInput,
      coverAlt: '',
      contentHtml: `<p>${'Un paragraphe solide. '.repeat(40)}</p><img src="/a.jpg">`,
    });
    expect(result.ready).toBe(true);
    expect(result.checks.find((check) => check.id === 'images')?.status).toBe('warning');
    expect(result.checks.find((check) => check.id === 'cover')?.status).toBe('warning');
  });

  it('accepte une couverture décorative sans alt', () => {
    const result = analyzePublishReadiness({ ...validInput, coverAlt: '', coverDecorative: true });
    expect(result.checks.find((check) => check.id === 'cover')?.status).toBe('ok');
  });

  it('compte les liens invalides', () => {
    expect(
      countInvalidLinks(
        '<a href="">x</a><a href="#">y</a><a href="javascript:alert(1)">z</a><a href="https://qoe.fi">ok</a>'
      )
    ).toBe(3);
  });

  it('compte les mots hors balises', () => {
    expect(countWordsInHtml('<p>Bonjour <strong>le</strong> monde</p>')).toBe(3);
  });
});
