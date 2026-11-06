// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InlineChoice, InlineText, InlineDate, InlineToggle } from '../InlineScalar';

describe('InlineScalar', () => {
  describe('InlineChoice', () => {
    const options = [
      { id: 'low', label: 'Basse' },
      { id: 'normal', label: 'Normale' },
      { id: 'high', label: 'Haute' },
    ];

    it('affiche la valeur initiale et exécute onSave avec rollback en cas d’erreur', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Network error'));
      const onStatus = vi.fn();

      render(
        <InlineChoice
          value="normal"
          options={options}
          onSave={onSave}
          label="Priorité"
          onStatus={onStatus}
        />
      );

      // Le select affiche la valeur normale
      const trigger = screen.getByRole('button', { name: /Priorité/ });
      expect(trigger).toHaveTextContent('Normale');

      // Sélection d'une nouvelle option
      fireEvent.click(trigger);
      const optionHigh = await screen.findByRole('option', { name: 'Haute' });
      fireEvent.click(optionHigh);

      expect(onSave).toHaveBeenCalledWith('high');

      // Après échec, rollback à Normale
      await waitFor(() => {
        expect(trigger).toHaveTextContent('Normale');
      });
      expect(onStatus).not.toHaveBeenCalled();
    });

    it('notifie le statut en cas de succès', async () => {
      const onSave = vi.fn().mockResolvedValue(true);
      const onStatus = vi.fn();

      render(
        <InlineChoice
          value="low"
          options={options}
          onSave={onSave}
          label="Priorité"
          onStatus={onStatus}
          successLabel="Priorité mise à jour"
        />
      );

      const trigger = screen.getByRole('button', { name: /Priorité/ });
      fireEvent.click(trigger);
      const optionHigh = await screen.findByRole('option', { name: 'Haute' });
      fireEvent.click(optionHigh);

      await waitFor(() => {
        expect(onStatus).toHaveBeenCalledWith(
          expect.stringContaining('Priorité mise à jour · audité à')
        );
      });
    });
  });

  describe('InlineText', () => {
    it('permet la saisie, sauvegarde sur Entrée et notifie le statut', async () => {
      const onSave = vi.fn().mockResolvedValue(true);
      const onStatus = vi.fn();

      render(
        <InlineText
          value="Titre initial"
          onSave={onSave}
          label="Titre du dossier"
          onStatus={onStatus}
        />
      );

      const display = screen.getByRole('button', { name: 'Titre du dossier' });
      expect(display).toHaveTextContent('Titre initial');

      // Clic pour passer en mode édition
      fireEvent.click(display);

      const input = screen.getByRole('textbox', { name: 'Titre du dossier' });
      fireEvent.change(input, { target: { value: 'Nouveau titre' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSave).toHaveBeenCalledWith('Nouveau titre');
      await waitFor(() => {
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Texte modifié · audité à'));
      });
    });

    it('annule la saisie sur Échap', async () => {
      const onSave = vi.fn();

      render(<InlineText value="Titre stable" onSave={onSave} label="Titre" />);

      const display = screen.getByRole('button', { name: 'Titre' });
      fireEvent.click(display);

      const input = screen.getByRole('textbox', { name: 'Titre' });
      fireEvent.change(input, { target: { value: 'Modification abandonnée' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      // Revient au texte initial sans appel à onSave
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Titre' })).toHaveTextContent('Titre stable');
    });

    it('effectue un rollback si onSave renvoie false', async () => {
      const onSave = vi.fn().mockResolvedValue(false);

      render(<InlineText value="Valeur sûre" onSave={onSave} label="Description" />);

      const display = screen.getByRole('button', { name: 'Description' });
      fireEvent.click(display);

      const input = screen.getByRole('textbox', { name: 'Description' });
      fireEvent.change(input, { target: { value: 'Valeur rejetée' } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Description' })).toHaveTextContent(
          'Valeur sûre'
        );
      });
    });
  });

  describe('InlineDate', () => {
    it('enregistre l’échéance convertie en ISO sur blur', async () => {
      const onSave = vi.fn().mockResolvedValue(true);
      const onStatus = vi.fn();

      render(
        <InlineDate
          value="2026-11-10T14:30:00.000Z"
          onSave={onSave}
          label="Date d’échéance"
          onStatus={onStatus}
        />
      );

      const input = screen.getByLabelText('Date d’échéance');
      fireEvent.change(input, { target: { value: '2026-11-12T10:00' } });
      fireEvent.blur(input);

      expect(onSave).toHaveBeenCalled();
      const calledIso = onSave.mock.calls[0][0];
      expect(calledIso).toContain('2026-11-12');
      await waitFor(() => {
        expect(onStatus).toHaveBeenCalledWith(
          expect.stringContaining('Échéance modifiée · audité à')
        );
      });
    });
  });

  describe('InlineToggle', () => {
    it('bascule la valeur et rollback en cas d’erreur', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Erreur'));

      render(<InlineToggle checked={false} onSave={onSave} label="Certification" />);

      const checkbox = screen.getByRole('checkbox', { name: 'Certification' });
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(onSave).toHaveBeenCalledWith(true);

      await waitFor(() => {
        expect(checkbox).not.toBeChecked();
      });
    });
  });
});
