// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComparisonTable } from '../ComparisonTable';

// `comparison_rows` vient de la console : des entrées sans libellé produisaient
// un tableau aux cellules vides, une entrée nulle cassait la section.

describe('ComparisonTable — lignes depuis la console', () => {
  it('ignore les lignes de forme inattendue et garde les lignes par défaut', () => {
    render(<ComparisonTable config={{ comparison_rows: '[null, 3, {"feature":"X"}]' }} />);
    expect(screen.getByText('Commission sur vos revenus')).toBeInTheDocument();
  });

  it('affiche les lignes personnalisées quand elles sont valides', () => {
    render(
      <ComparisonTable
        config={{
          comparison_rows: JSON.stringify([
            { feature: 'Ligne console', substack: 'Non', qoefi: 'Oui', highlighted: true },
          ]),
        }}
      />
    );
    expect(screen.getByText('Ligne console')).toBeInTheDocument();
    expect(screen.queryByText('Commission sur vos revenus')).toBeNull();
  });
});
