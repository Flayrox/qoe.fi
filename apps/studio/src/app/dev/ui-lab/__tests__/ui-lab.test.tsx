// =====================================================================
// 🔎 UI Lab — le filtre de l'inventaire
// =====================================================================
// Le lab est une page de revue : on y cherche un composant par son nom ou
// son chemin. Le champ doit donc être nommé pour un lecteur d'écran, et le
// raccourci qu'il annonce (« esc ») doit réellement vider la recherche.
// Les 24 spécimens sont neutralisés : c'est le filtre qui est mesuré, pas
// leurs rendus respectifs.
// =====================================================================

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../specimens/01-menu-dropdown', () => ({ MenuDropdownSpecimen: () => null }));
vi.mock('../specimens/02-select', () => ({ SelectSpecimen: () => null }));
vi.mock('../specimens/03-segmented', () => ({ SegmentedSpecimen: () => null }));
vi.mock('../specimens/04-radio-cards', () => ({ RadioCardsSpecimen: () => null }));
vi.mock('../specimens/05-multi-select', () => ({ MultiSelectSpecimen: () => null }));
vi.mock('../specimens/06-switch', () => ({ SwitchSpecimen: () => null }));
vi.mock('../specimens/08-button', () => ({ ButtonSpecimen: () => null }));
vi.mock('../specimens/09-fields', () => ({ FieldsSpecimen: () => null }));
vi.mock('../specimens/10-overlays', () => ({ OverlaysSpecimen: () => null }));
vi.mock('../specimens/11-dates', () => ({ DatesSpecimen: () => null }));
vi.mock('../specimens/12-composition', () => ({ CompositionSpecimen: () => null }));
vi.mock('../specimens/13-inputs-complexes', () => ({ InputsComplexSpecimen: () => null }));
vi.mock('../specimens/14-selection-tables', () => ({ SelectionTablesSpecimen: () => null }));
vi.mock('../specimens/15-ported-pieces', () => ({ PortedPiecesSpecimen: () => null }));
vi.mock('../specimens/16-mark-skin', () => ({ MarkSkinSpecimen: () => null }));
vi.mock('../specimens/17-annotation-flow', () => ({ AnnotationFlowSpecimen: () => null }));
vi.mock('../specimens/18-sidebar', () => ({ SidebarSpecimen: () => null }));
vi.mock('../specimens/19-social-cards', () => ({ SocialCardsSpecimen: () => null }));
vi.mock('../specimens/20-auth', () => ({ AuthSpecimen: () => null }));
vi.mock('../specimens/21-modals', () => ({ ModalsSpecimen: () => null }));
vi.mock('../specimens/22-image-editor', () => ({ ImageEditorSpecimen: () => null }));
vi.mock('../specimens/23-icons', () => ({ IconsSpecimen: () => null }));
vi.mock('../specimens/24-structure', () => ({ StructureSpecimen: () => null }));
vi.mock('../specimens/25-feedback', () => ({ FeedbackSpecimen: () => null }));

import type { Catalog } from '../catalog-types';
import { UiLab } from '../ui-lab';

const CATALOG: Catalog = {
  generatedAt: '2026-11-20T10:00:00.000Z',
  total: 2,
  signals: {
    primitivesNeverImported: 0,
    primitivesTotal: 2,
    rawButtons: 0,
    rawButtonFiles: 0,
    nativeSelectFiles: 0,
    rawInputFiles: 0,
    handRolledOverlays: 0,
  },
  families: [
    {
      id: 'primitives',
      label: 'Primitives (2)',
      items: [
        {
          name: 'button',
          path: 'packages/ui/src/primitives/button/button.tsx',
          lines: 210,
          source: 'ui',
          usages: 142,
        },
        {
          name: 'badge',
          path: 'packages/ui/src/primitives/badge/badge.tsx',
          lines: 88,
          source: 'ui',
          usages: 0,
        },
      ],
    },
  ],
};

describe('UI Lab — inventaire', () => {
  it('nomme le champ de recherche et le vide avec Échap', () => {
    render(<UiLab catalog={CATALOG} />);

    const search = screen.getByRole('searchbox', { name: /filtrer l’inventaire/i });

    // Les mêmes chemins apparaissent aussi sous les spécimens (liste
    // « Sources ») : on mesure l'inventaire, pas le sommaire des démos.
    const inventory = document.getElementById('inventaire') as HTMLElement;
    expect(
      within(inventory).getByText('packages/ui/src/primitives/badge/badge.tsx')
    ).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'button' } });
    expect((search as HTMLInputElement).value).toBe('button');
    expect(
      within(inventory).queryByText('packages/ui/src/primitives/badge/badge.tsx')
    ).not.toBeInTheDocument();

    // Le bouton affiché à droite du champ annonce « esc » : la touche doit
    // faire la même chose que le clic, sinon l'affordance ment.
    fireEvent.keyDown(search, { key: 'Escape' });
    expect((search as HTMLInputElement).value).toBe('');
    expect(
      within(inventory).getByText('packages/ui/src/primitives/badge/badge.tsx')
    ).toBeInTheDocument();
  });
});
