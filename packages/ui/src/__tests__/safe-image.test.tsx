// @vitest-environment jsdom
// =====================================================================
// 🛡️ SafeImage — l'erreur appartient à une source, pas au composant
// =====================================================================
// 📖 Le feed réutilise les mêmes instances de carte quand la source change
//    (image suivante, serveur différent après bascule de CDN). Si l'état
//    d'erreur n'est pas remis à zéro, une seule image morte condamnait
//    toutes les suivantes à l'icône de repli — sans aucune erreur visible.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { SafeImage } from '../SafeImage';

const image = () => document.querySelector('img');

describe('SafeImage — repli et récupération', () => {
  it('affiche le repli quand l’image casse', () => {
    render(<SafeImage src="/images/introuvable.webp" alt="Illustration" width={40} height={40} />);

    const img = image()!;
    fireEvent.error(img);

    expect(image()).toBeNull();
    expect(document.querySelector('.lucide-image')).not.toBeNull();
  });

  it('réaffiche une image quand la source change après une erreur', () => {
    const { rerender } = render(
      <SafeImage src="/images/morte.webp" alt="Illustration" width={40} height={40} />
    );
    fireEvent.error(image()!);
    expect(image()).toBeNull();

    rerender(<SafeImage src="/images/vivante.webp" alt="Illustration" width={40} height={40} />);

    expect(image()?.getAttribute('src')).toContain('vivante.webp');
  });

  it('utilise le repli fourni avant l’icône, une seule fois', () => {
    const { rerender } = render(
      <SafeImage
        src="/images/morte.webp"
        fallbackSrc="/images/repli.webp"
        alt="Illustration"
        width={40}
        height={40}
      />
    );

    fireEvent.error(image()!);

    const fallback = image();
    expect(fallback?.getAttribute('src')).toContain('repli.webp');

    // Le repli casse aussi : on tombe sur l'icône, pas sur une boucle.
    fireEvent.error(image()!);
    expect(image()).toBeNull();

    // Une nouvelle source redémarre la chaîne.
    rerender(
      <SafeImage
        src="/images/nouvelle.webp"
        fallbackSrc="/images/repli.webp"
        alt="Illustration"
        width={40}
        height={40}
      />
    );
    expect(image()?.getAttribute('src')).toContain('nouvelle.webp');
  });
});
