import { describe, expect, it } from 'vitest';
import { formatBionicWord, formatBionicText, formatBionicHtml } from '../bionic';

describe('Bionic Reading', () => {
  it('met en gras le début des mots courts et longs', () => {
    expect(formatBionicWord('un')).toBe('<b>u</b>n');
    expect(formatBionicWord('mode')).toBe('<b>mo</b>de');
    expect(formatBionicWord('lecture')).toBe('<b>lec</b>ture');
    expect(formatBionicWord('intelligence')).toBe('<b>intel</b>ligence');
  });

  it('gère correctement les mots avec apostrophe française', () => {
    expect(formatBionicWord("l'article")).toBe("<b>l'art</b>icle");
    expect(formatBionicWord("d'une")).toBe("<b>d'u</b>ne");
  });

  it('préserve la ponctuation attachée aux mots', () => {
    expect(formatBionicWord('Bonjour,')).toBe('<b>Bon</b>jour,');
    expect(formatBionicWord('(incroyable)')).toBe('(<b>incr</b>oyable)');
    expect(formatBionicWord('fin.')).toBe('<b>f</b>in.');
  });

  it('transforme une phrase complète sans altérer les espaces', () => {
    const input = 'La lecture rapide aide la concentration.';
    const output = formatBionicText(input);
    expect(output).toContain('<b>L</b>a');
    expect(output).toContain('<b>lec</b>ture');
    expect(output).toContain('<b>ra</b>pide');
    expect(output).toContain('<b>concen</b>tration.');
  });

  it('transforme du HTML sans altérer les balises ni les attributs', () => {
    const html = '<p class="lead">Un <strong>bel exemple</strong> pour tester.</p>';
    const output = formatBionicHtml(html);
    expect(output.startsWith('<p class="lead">')).toBe(true);
    expect(output.endsWith('</p>')).toBe(true);
    expect(output).toContain('<strong><b>b</b>el');
    expect(output).toContain('</strong>');
  });

  // ⚠️ Une entité HTML n'est pas un mot : `&nbsp;` coupé en `<b>&n</b>bsp;`
  // s'affiche littéralement « a&n bsp;b » — l'espace insécable disparaît et
  // le texte publié devient faux à l'écran.
  it('ne coupe jamais une entité HTML', () => {
    expect(formatBionicWord('&nbsp;')).toBe('&nbsp;');
    expect(formatBionicText('a&nbsp;b')).toBe('<b>a</b>&nbsp;<b>b</b>');
    expect(formatBionicHtml('<p>&laquo;&nbsp;Bonjour&nbsp;&raquo;</p>')).toBe(
      '<p>&laquo;&nbsp;<b>Bon</b>jour&nbsp;&raquo;</p>'
    );
    expect(formatBionicHtml('<p>Tom &amp; Jerry</p>')).toContain('<b>T</b>om &amp; <b>Je</b>rry');
  });
});
