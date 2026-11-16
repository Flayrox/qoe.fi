// @vitest-environment jsdom
// =====================================================================
// 🧪 DataGrid — la grille partagée des écrans d'exploitation
// =====================================================================
// Régression : sans colonne « en-tête de ligne » (`isRowHeader`), react-aria
// refuse de construire la table et TOUS les écrans qui utilisent cette grille
// (signalements, users, travail, support, abuse, approvals, rétention…)
// plantaient au rendu. La première colonne visible porte désormais l'en-tête.
// =====================================================================

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const refresh = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push, replace: vi.fn() }),
}));

import { DataGrid, type GridColumn } from '../DataGrid';

interface Row {
  id: string;
  title: string;
  count: number;
}

const rows: Row[] = [
  { id: 'a', title: 'Alpha', count: 2 },
  { id: 'b', title: 'Bêta', count: 10 },
];

const columns: GridColumn<Row>[] = [
  {
    id: 'title',
    header: 'Titre',
    cell: (row) => row.title,
    sort: { kind: 'text', value: (r) => r.title },
  },
  {
    id: 'count',
    header: 'Volume',
    cell: (row) => row.count,
    sort: { kind: 'number', value: (r) => r.count },
  },
];

describe('DataGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend les lignes avec la première colonne comme en-tête de ligne', () => {
    render(<DataGrid ariaLabel="Grille de test" rows={rows} columns={columns} />);

    expect(screen.getByRole('grid', { name: 'Grille de test' })).toBeDefined();
    expect(screen.getAllByRole('rowheader')).toHaveLength(2);
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Bêta')).toBeDefined();
  });

  it('respecte l’ordre de tri déclaré par la colonne', () => {
    render(
      <DataGrid
        ariaLabel="Grille triée"
        rows={rows}
        columns={columns}
        initialSort={{ column: 'count', direction: 'descending' }}
      />
    );

    const headers = screen.getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Bêta', 'Alpha']);
  });

  it('masque les colonnes demandées et applique l’ordre déclaré', () => {
    render(
      <DataGrid
        ariaLabel="Grille filtrée"
        rows={rows}
        columns={columns}
        hiddenColumns={['count']}
        columnOrder={['count', 'title']}
      />
    );

    expect(screen.queryByText('Volume')).toBeNull();
    expect(screen.getByText('Titre')).toBeDefined();
  });

  it('affiche l’état vide quand aucune ligne ne correspond', () => {
    render(
      <DataGrid
        ariaLabel="Grille vide"
        rows={[]}
        columns={columns}
        emptyState="Aucun résultat pour ces filtres."
      />
    );

    expect(screen.getByText('Aucun résultat pour ces filtres.')).toBeDefined();
  });

  it('ouvre la ligne au clavier et rafraîchit avec « r »', () => {
    const onRowOpen = vi.fn();
    render(
      <DataGrid ariaLabel="Grille clavier" rows={rows} columns={columns} onRowOpen={onRowOpen} />
    );

    const grid = screen.getByRole('grid', { name: 'Grille clavier' }).closest('div[tabindex]');
    expect(grid).not.toBeNull();

    fireEvent.keyDown(grid as HTMLElement, { key: 'Enter' });
    expect(onRowOpen).toHaveBeenCalledWith(rows[0]);

    fireEvent.keyDown(grid as HTMLElement, { key: 'r' });
    expect(refresh).toHaveBeenCalled();
  });

  it('expose les actions de ligne dans un menu', () => {
    const onSelect = vi.fn();
    render(
      <DataGrid
        ariaLabel="Grille actions"
        rows={rows}
        columns={columns}
        rowMenu={() => [{ id: 'open', label: 'Ouvrir', onSelect }]}
      />
    );

    fireEvent.click(screen.getAllByLabelText('Actions de la ligne')[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ouvrir' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
