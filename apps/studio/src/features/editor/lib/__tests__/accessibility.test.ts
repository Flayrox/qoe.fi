import { describe, expect, it } from 'vitest';
import { countImagesWithoutAlt } from '../accessibility';

describe('countImagesWithoutAlt', () => {
  it('ignore un contenu sans image', () => {
    expect(countImagesWithoutAlt('<p>Du texte</p>')).toEqual({ total: 0, missing: 0 });
  });

  it('compte les images sans alt, alt vide ou alt blanc', () => {
    const html =
      '<p><img src="a.jpg" alt="Une photo"></p>' +
      '<img src="b.jpg">' +
      '<img src="c.jpg" alt="">' +
      '<img src="d.jpg" alt="   ">';

    expect(countImagesWithoutAlt(html)).toEqual({ total: 4, missing: 3 });
  });

  it('reconnaît les attributs dans un autre ordre ou entre apostrophes', () => {
    const html =
      "<img alt='Décrite' src='a.jpg'><img data-gallery-image='true' src='b.jpg' alt='Galerie'>";
    expect(countImagesWithoutAlt(html)).toEqual({ total: 2, missing: 0 });
  });
});
