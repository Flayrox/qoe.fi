import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageDetailsPanel, type ImageDetails } from '../ImageDetailsPanel';

describe('ImageDetailsPanel', () => {
  const initialValue: ImageDetails = {
    alt: 'Vue aérienne',
    caption: 'Une belle vue',
    credit: 'Photo par Alice',
  };

  it('renders all three fields for single image', () => {
    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        kind="image"
        value={initialValue}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Description \(alt\)/i)).toHaveValue('Vue aérienne');
    expect(screen.getByLabelText(/Légende/i)).toHaveValue('Une belle vue');
    expect(screen.getByLabelText(/Crédit photo/i)).toHaveValue('Photo par Alice');
    expect(screen.getByRole('button', { name: /Enregistrer/i })).toBeInTheDocument();
  });

  it('renders only alt field for gallery image', () => {
    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        kind="galleryImage"
        value={initialValue}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Description \(alt\)/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Légende/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Crédit photo/i)).not.toBeInTheDocument();
  });

  it('calls onChange when user types in an input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value={initialValue}
        onChange={onChange}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const altInput = screen.getByLabelText(/Description \(alt\)/i);
    await user.type(altInput, ' extra');

    expect(onChange).toHaveBeenCalled();
  });

  it('calls onSave when clicking Enregistrer button', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value={initialValue}
        onChange={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Enregistrer/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onSave when pressing Enter inside an input', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value={initialValue}
        onChange={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    const captionInput = screen.getByLabelText(/Légende/i);
    await user.type(captionInput, '{Enter}');
    expect(onSave).toHaveBeenCalled();
  });

  it('calls onClose when clicking Annuler or close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value={initialValue}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Fermer/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('signale un alt manquant sans bloquer l’enregistrement', () => {
    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value={{ alt: '', caption: '', credit: '' }}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Alt manquant/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enregistrer/i })).toBeEnabled();
  });

  it('renders replace button and calls onReplace when provided', async () => {
    const user = userEvent.setup();
    const onReplace = vi.fn();

    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value={initialValue}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onReplace={onReplace}
      />
    );

    const replaceBtn = screen.getByRole('button', { name: /Remplacer/i });
    await user.click(replaceBtn);
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('renders crop button and calls onCrop when provided', async () => {
    const user = userEvent.setup();
    const onCrop = vi.fn();

    render(
      <ImageDetailsPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value={initialValue}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onCrop={onCrop}
      />
    );

    const cropBtn = screen.getByRole('button', { name: /Recadrer/i });
    expect(cropBtn).toBeInTheDocument();
    await user.click(cropBtn);
    expect(onCrop).toHaveBeenCalledTimes(1);
  });
});
