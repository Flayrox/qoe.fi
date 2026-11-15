import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnotationNotePanel } from '../AnnotationNotePanel';

describe('AnnotationNotePanel', () => {
  it('renders quote, note and character count', () => {
    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote="Ceci est une citation remarquable."
        note="Explication de l'auteur"
        onChangeNote={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        canDelete={false}
      />
    );

    expect(screen.getByText(/Ceci est une citation remarquable/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Note d'auteur/i })).toHaveValue(
      "Explication de l'auteur"
    );
    expect(screen.getByText(/23 car\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enregistrer/i })).toBeEnabled();
  });

  it('disables save button when note is empty', () => {
    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote="Passage"
        note="   "
        onChangeNote={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        canDelete={false}
      />
    );

    expect(screen.getByRole('button', { name: /Enregistrer/i })).toBeDisabled();
    expect(screen.getByText(/Ajoutez une note pour ce passage/i)).toBeInTheDocument();
  });

  it('calls onChangeNote when user types', async () => {
    const user = userEvent.setup();
    const onChangeNote = vi.fn();

    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote="Passage"
        note=""
        onChangeNote={onChangeNote}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        canDelete={false}
      />
    );

    const textarea = screen.getByRole('textbox', { name: /Note d'auteur/i });
    await user.type(textarea, 'Nouvelle note');
    expect(onChangeNote).toHaveBeenCalled();
  });

  it('calls onSave on button click or Cmd+Enter / Ctrl+Enter', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote="Passage"
        note="Texte valide"
        onChangeNote={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        canDelete={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Enregistrer/i }));
    expect(onSave).toHaveBeenCalledTimes(1);

    const textarea = screen.getByRole('textbox', { name: /Note d'auteur/i });
    await user.type(textarea, '{Meta>}{Enter}{/Meta}');
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('renders and triggers delete button when canDelete is true', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote="Passage"
        note="Texte"
        onChangeNote={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
        canDelete={true}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /Supprimer l'annotation/i });
    expect(deleteBtn).toBeInTheDocument();
    await user.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('propose de revenir au texte annoté quand une annotation existe', async () => {
    const user = userEvent.setup();
    const onEditText = vi.fn();

    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote="Passage"
        note="Texte"
        onChangeNote={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onEditText={onEditText}
        canDelete={true}
      />
    );

    const editBtn = screen.getByRole('button', { name: /Modifier le texte/i });
    await user.click(editBtn);
    expect(onEditText).toHaveBeenCalledTimes(1);
  });

  it('déplie une citation longue puis la replie', async () => {
    const user = userEvent.setup();
    const longQuote = 'Un passage très long. '.repeat(20);

    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote={longQuote}
        note="Texte"
        onChangeNote={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        canDelete={false}
      />
    );

    const quote = screen.getByText(new RegExp(longQuote.trim().slice(0, 24)));
    expect(quote).toHaveClass('line-clamp-3');

    const expand = screen.getByRole('button', { name: /Déplier la citation/i });
    await user.click(expand);

    expect(quote).not.toHaveClass('line-clamp-3');
    expect(screen.getByRole('button', { name: /Replier la citation/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    await user.click(screen.getByRole('button', { name: /Replier la citation/i }));
    expect(quote).toHaveClass('line-clamp-3');
  });

  it('ne propose pas de dépliage pour une citation courte', () => {
    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote="Passage"
        note="Texte"
        onChangeNote={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        canDelete={false}
      />
    );

    expect(screen.queryByRole('button', { name: /Déplier la citation/i })).toBeNull();
  });

  it('calls onClose when clicking cancel or close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <AnnotationNotePanel
        open={true}
        position={{ top: 100, left: 100 }}
        quote="Passage"
        note="Texte"
        onChangeNote={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
        canDelete={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Fermer/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
