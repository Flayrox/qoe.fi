import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';

/**
 * 🖼️ Image d'article — `Image` enrichie de la description (alt), de la
 * légende et du crédit photo.
 *
 * Le HTML produit reste volontairement simple et lisible par le sanitizer des
 * tenants : `<img>` seul tant qu'il n'y a ni légende ni crédit, et
 * `<figure data-credit><img><figcaption>` dès qu'il y en a un. Les anciens
 * articles (images seules) continuent donc de s'afficher à l'identique.
 */
export const ArticleImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),

      // Une image peut venir d'un `<img>` seul (ancien contenu) ou d'un
      // `<figure>` (contenu avec légende) : on lit l'image dans les deux cas.
      src: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('src') ?? element.querySelector('img')?.getAttribute('src') ?? null,
      },

      alt: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('alt') ?? element.querySelector('img')?.getAttribute('alt') ?? '',
        renderHTML: (attributes) => ({ alt: (attributes.alt as string) || '' }),
      },

      // Légende et crédit sont portés par le `<figure>` englobant : on les
      // relit là au parsing, et on ne les écrit pas sur l'`<img>`.
      caption: {
        default: '',
        parseHTML: (element) => {
          const figcaption = element.closest('figure')?.querySelector('figcaption');
          if (!figcaption) return '';
          // Le crédit est un `<span>` dans la légende : on le retire pour ne
          // pas le dupliquer dans le texte de la légende.
          const clone = figcaption.cloneNode(true) as HTMLElement;
          clone.querySelector('.image-credit')?.remove();
          return clone.textContent?.trim() ?? '';
        },
        // Conservés dans `HTMLAttributes` pour être disponibles dans
        // `renderHTML`, puis retirés de l'`<img>` par ce dernier.
        renderHTML: (attributes) => ({ caption: (attributes.caption as string) ?? '' }),
      },

      credit: {
        default: '',
        parseHTML: (element) => element.closest('figure')?.getAttribute('data-credit') ?? '',
        renderHTML: (attributes) => ({ credit: (attributes.credit as string) ?? '' }),
      },
    };
  },

  // La règle `<figure>` capture la figure entière : comme le nœud est une
  // feuille, son contenu (dont la légende) n'est pas ré-analysé comme du texte
  // du document — sinon la légende finissait en paragraphe après l'image.
  parseHTML() {
    return [{ tag: 'figure[data-article-image]' }, { tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { caption, credit, ...imageAttributes } = HTMLAttributes as Record<string, unknown>;
    const image: [string, Record<string, unknown>] = [
      'img',
      mergeAttributes(imageAttributes, { loading: 'lazy' }),
    ];

    const captionText = String(caption ?? '').trim();
    const creditText = String(credit ?? '').trim();
    if (!captionText && !creditText) return image;

    const figcaption: unknown[] = ['figcaption', {}];
    if (captionText) figcaption.push(captionText);
    if (creditText) {
      figcaption.push(['span', { class: 'image-credit' }, `© ${creditText}`]);
    }

    return [
      'figure',
      {
        'data-article-image': 'true',
        ...(creditText ? { 'data-credit': creditText } : {}),
      },
      image,
      figcaption,
    ];
  },
});
