// =====================================================================
// 🧪 @qoe/flags — FeatureGate (garde déclarative de composant)
// =====================================================================
// `gate.tsx` était mesuré à 0 % de branches : aucune preuve que la garde
// affiche bien le contenu quand le flag est actif, ni le repli quand il est
// coupé. Rendu statique (react-dom/server) : pas de DOM à installer, la
// décision d'affichage est purement synchrone.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeatureGate } from '../gate';
import { FlagsProvider } from '../provider';
import type { FlagKey } from '../flags';

const FLAG: FlagKey = 'feed-recommendations';

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe('FeatureGate — décision d’affichage', () => {
  it('affiche les enfants quand le flag est activé', () => {
    const html = render(
      <FlagsProvider flags={{ [FLAG]: true }}>
        <FeatureGate flag={FLAG}>
          <p>visible</p>
        </FeatureGate>
      </FlagsProvider>
    );

    expect(html).toContain('visible');
  });

  it('masque les enfants et n’affiche aucun repli par défaut', () => {
    const html = render(
      <FlagsProvider flags={{ [FLAG]: false }}>
        <FeatureGate flag={FLAG}>
          <p>visible</p>
        </FeatureGate>
      </FlagsProvider>
    );

    expect(html).toBe('');
  });

  it('affiche le repli fourni quand le flag est coupé', () => {
    const html = render(
      <FlagsProvider flags={{ [FLAG]: false }}>
        <FeatureGate flag={FLAG} fallback={<p>repli</p>}>
          <p>visible</p>
        </FeatureGate>
      </FlagsProvider>
    );

    expect(html).toContain('repli');
    expect(html).not.toContain('visible');
  });

  it('suit le défaut du registre sans provider', () => {
    // `feed-recommendations` vaut `true` au registre : sans contexte, la garde
    // passe. Un `false` au registre est couvert par le test « coupé » ci-dessus.
    const html = render(
      <FeatureGate flag={FLAG}>
        <p>defaut</p>
      </FeatureGate>
    );

    expect(html).toContain('defaut');
  });
});
