// =====================================================================
// 🧪 StudioField — pas de `<label for>` orphelin
// =====================================================================
// Le défaut mesuré (R145) : `tabs/import.tsx` passait
// `htmlFor="import-source"` pour un `Select` React-Aria qui n'expose aucun
// `id` — le document promettait une association inexistante. Le champ ne
// fabrique donc plus de `<label for>` sans contrôle réel, et le nom
// accessible reste porté par le contrôle lui-même.
// =====================================================================

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
// L'onglet d'import appelle une Server Action : on ne monte que son DOM.
vi.mock('@/app/(creator)/import/actions', () => ({
  importSubscribersCsvAction: vi.fn(),
}));

import { Button } from '@qoe/ui/button';
import { StudioField } from '@/components/studio-page';

describe('StudioField', () => {
  it('sans `htmlFor`, ne rend pas de label associé à rien', () => {
    const { container } = render(
      <StudioField label="Plateforme d’origine">
        <Button type="button" aria-label="Plateforme d'origine">
          Substack
        </Button>
      </StudioField>
    );

    expect(container.querySelector('label')).toBeNull();
    expect(screen.getByText('Plateforme d’origine')).toBeInTheDocument();
    // Le nom accessible du contrôle vient du contrôle, pas d'un label mort.
    const trigger = screen.getAllByRole('button')[0];
    expect(trigger).toHaveAccessibleName("Plateforme d'origine");
  });

  it('avec `htmlFor`, associe le label au contrôle réel', () => {
    const { container } = render(
      <StudioField label="Précisions" htmlFor="import-source-detail">
        <input id="import-source-detail" />
      </StudioField>
    );

    const label = container.querySelector('label');
    expect(label).not.toBeNull();
    expect(label).toHaveAttribute('for', 'import-source-detail');
    expect(screen.getByLabelText('Précisions')).toHaveAttribute('id', 'import-source-detail');
  });

  it('le champ d’import associe son label à un contrôle qui existe vraiment', async () => {
    const { ImportSourceField } = await import('@/features/settings/tabs/import');
    const { container } = render(<ImportSourceField source="substack" onSourceChange={() => {}} />);

    // Le défaut : `for="import-source"` sans aucun id de ce nom.
    const label = container.querySelector('label[for="import-source"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Plateforme d’origine');

    const trigger = container.querySelector('#import-source');
    expect(trigger).not.toBeNull();
    expect(trigger?.tagName).toBe('BUTTON');

    // `@qoe/ui/select` compose le nom du déclencheur (valeur + libellé) : il
    // porte le libellé du champ, ce qui est le contrat de la liaison.
    expect(trigger).toHaveAccessibleName(/Plateforme d'origine/);
  });
});
