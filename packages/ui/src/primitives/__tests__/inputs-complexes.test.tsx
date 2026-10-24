import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ComboBox, filterComboBoxOptions } from '../combobox/combobox';
import { ColorField } from '../color/color';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '../table/table';

const FORMATS = [
  { id: 'essai', label: 'Essai' },
  { id: 'ephemere', label: 'Éphémère', description: 'note courte' },
  { id: 'reportage', label: 'Reportage' },
];

describe('ComboBox', () => {
  it('affiche le libellé de la valeur sélectionnée, pas la clé', () => {
    render(<ComboBox label="Format" options={FORMATS} value="ephemere" />);
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Éphémère');
  });

  it('filtre sans tenir compte des accents', () => {
    expect(filterComboBoxOptions(FORMATS, 'eph').map((option) => option.id)).toEqual(['ephemere']);
    expect(filterComboBoxOptions(FORMATS, 'RE').map((option) => option.id)).toEqual([
      'ephemere',
      'reportage',
    ]);
  });

  it('garde toutes les options sur une recherche vide', () => {
    expect(filterComboBoxOptions(FORMATS, '   ')).toHaveLength(FORMATS.length);
  });

  it('montre la croix seulement quand une valeur est choisie', () => {
    const { rerender } = render(<ComboBox label="Format" options={FORMATS} />);
    expect(screen.queryByRole('button', { name: 'Effacer' })).toBeNull();

    rerender(<ComboBox label="Format" options={FORMATS} clearable value="essai" />);
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeTruthy();
  });

  it('efface la valeur au clic sur la croix', () => {
    const onValueChange = vi.fn();
    render(
      <ComboBox
        label="Format"
        options={FORMATS}
        clearable
        value="essai"
        onValueChange={onValueChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));

    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('relie le message d’erreur au champ', () => {
    render(<ComboBox label="Format" options={FORMATS} invalid errorMessage="Format inconnu" />);

    const input = screen.getByRole('combobox');
    const describedBy = input.getAttribute('aria-describedby');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Format inconnu');
  });
});

describe('Table', () => {
  const articles = [
    { id: '1', title: 'Le bruit des claviers', views: 1420 },
    { id: '2', title: 'Ce que la lenteur change', views: 0 },
  ];

  it('annonce l’état de tri de la colonne', () => {
    render(
      <Table aria-label="Écrits" sortDescriptor={{ column: 'views', direction: 'descending' }}>
        <TableHeader>
          <TableColumn id="title" isRowHeader>
            Écrit
          </TableColumn>
          <TableColumn id="views" allowsSorting>
            Vues
          </TableColumn>
        </TableHeader>
        <TableBody items={articles}>
          {(article) => (
            <TableRow id={article.id}>
              <TableCell>{article.title}</TableCell>
              <TableCell>{article.views}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('grid', { name: 'Écrits' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /vues/i }).getAttribute('aria-sort')).toBe(
      'descending'
    );
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('affiche le message prévu quand aucune ligne ne passe', () => {
    render(
      <Table aria-label="Écrits">
        <TableHeader>
          <TableColumn id="title" isRowHeader>
            Écrit
          </TableColumn>
        </TableHeader>
        <TableBody items={[]} emptyState="Aucun écrit">
          {() => null}
        </TableBody>
      </Table>
    );

    expect(screen.getByText('Aucun écrit')).toBeTruthy();
  });
});

describe('ColorField', () => {
  it('normalise la valeur en hexadécimal', () => {
    render(<ColorField label="Couleur" value="#c2410c" />);
    expect((screen.getByRole('textbox', { name: 'Couleur' }) as HTMLInputElement).value).toBe(
      '#C2410C'
    );
  });

  it('signale une valeur invalide', () => {
    render(<ColorField label="Couleur" value="#c2410c" invalid />);
    expect(screen.getByRole('textbox', { name: 'Couleur' }).getAttribute('aria-invalid')).toBe(
      'true'
    );
  });
});
