import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from '../checkbox/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TableSelectAllCell,
  TableSelectionCell,
} from '../table/table';

const ROWS = [
  { id: '1', title: 'Le bruit des claviers' },
  { id: '2', title: 'Ce que la lenteur change' },
];

function SelectionTable({
  selectionMode = 'multiple',
  selectedKeys,
  onSelectionChange,
}: {
  selectionMode?: 'single' | 'multiple';
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
}) {
  return (
    <Table
      aria-label="Écrits"
      selectionMode={selectionMode}
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange as never}
    >
      <TableHeader>
        <TableSelectAllCell />
        <TableColumn id="title" isRowHeader>
          Écrit
        </TableColumn>
      </TableHeader>
      <TableBody items={ROWS}>
        {(row) => (
          <TableRow id={row.id}>
            <TableSelectionCell rowId={row.id} />
            <TableCell>{row.title}</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

describe('Checkbox', () => {
  it('expose son libellé et son état', () => {
    render(<Checkbox label="Recevoir les nouveautés" defaultSelected />);

    // Une case native porte son état sur l'input (`checked`), pas sur un
    // `aria-checked` recopié : on vérifie ce que le navigateur expose.
    const checkbox = screen.getByRole('checkbox', {
      name: 'Recevoir les nouveautés',
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('annonce l’état indéterminé', () => {
    render(<Checkbox label="Tout sélectionner" isIndeterminate />);

    const input = screen.getByRole('checkbox', {
      name: 'Tout sélectionner',
    }) as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
    expect(document.querySelector('[data-state="mixed"]')).toBeTruthy();
  });

  it('bascule au clic et remonte la valeur', () => {
    const onChange = vi.fn();
    render(<Checkbox label="Recevoir les nouveautés" onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Recevoir les nouveautés' }));

    expect(onChange).toHaveBeenCalled();
  });

  it('change de marque sans changer d’état annoncé', () => {
    const { container, rerender } = render(
      <Checkbox label="Épingler" indicator="check" defaultSelected />
    );
    const box = () => container.querySelector('span[aria-hidden="true"]');

    // La coche est un svg ; le point est un rond plein, donc pas de svg.
    expect(box()?.querySelector('svg')).toBeTruthy();

    rerender(<Checkbox label="Épingler" indicator="dot" defaultSelected />);
    expect(box()?.querySelector('svg')).toBeFalsy();
    expect(box()?.querySelector('span.rounded-full')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Épingler' }) as HTMLInputElement).checked).toBe(
      true
    );

    rerender(<Checkbox label="Épingler" indicator="none" defaultSelected />);
    expect(box()?.querySelector('svg')).toBeFalsy();
    expect(box()?.querySelector('span')).toBeFalsy();
    expect((screen.getByRole('checkbox', { name: 'Épingler' }) as HTMLInputElement).checked).toBe(
      true
    );
  });

  it('garde le trait de l’indéterminé même sans coche', () => {
    const { container } = render(
      <Checkbox label="Tout sélectionner" indicator="none" isIndeterminate />
    );

    // Sans ce trait, « partiel » serait indiscernable de « coché » dès qu'on
    // retire la coche : le nom accessible ne suffit pas à voir l'état. Le
    // trait est une barre dessinée, pas l'icône « moins ».
    const box = container.querySelector('span[aria-hidden="true"]');
    expect(box?.getAttribute('data-state')).toBe('mixed');
    expect(box?.querySelector('[data-mixed]')).toBeTruthy();
    expect(
      (screen.getByRole('checkbox', { name: 'Tout sélectionner' }) as HTMLInputElement)
        .indeterminate
    ).toBe(true);
  });

  it('relie la description et l’état invalide', () => {
    render(
      <Checkbox label="Conditions" description="Obligatoire pour publier." invalid aria-invalid />
    );

    const checkbox = screen.getByRole('checkbox', { name: /Conditions/ });
    expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Obligatoire pour publier.')).toBeTruthy();
  });
});

describe('Table — colonne de sélection', () => {
  it('ajoute une case par ligne et une case d’en-tête en sélection multiple', () => {
    render(<SelectionTable />);

    // 1 en-tête + 2 lignes
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('masque « tout sélectionner » en sélection unique', () => {
    render(<SelectionTable selectionMode="single" />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('reflète la sélection partielle dans l’en-tête', () => {
    render(<SelectionTable selectedKeys={new Set(['1'])} />);

    const [selectAll] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(selectAll.indeterminate).toBe(true);
  });

  it('coche une ligne au clic sur sa case', () => {
    const onSelectionChange = vi.fn();
    render(<SelectionTable selectedKeys={new Set()} onSelectionChange={onSelectionChange} />);

    const [, firstRow] = screen.getAllByRole('checkbox');
    fireEvent.click(firstRow);

    expect(onSelectionChange).toHaveBeenCalled();
    const keys = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(keys)).toEqual(['1']);
  });
});
