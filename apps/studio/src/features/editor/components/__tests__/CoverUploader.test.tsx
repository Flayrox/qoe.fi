import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoverUploader } from '../CoverUploader';

describe('CoverUploader', () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('renders add cover button when no imageUrl is provided', () => {
    render(
      <CoverUploader
        imageUrl={null}
        title="Article de test"
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /\+ Ajouter une image de couverture/i })
    ).toBeInTheDocument();
  });

  it('renders uploading spinner when isUploading is true', () => {
    render(
      <CoverUploader
        imageUrl={null}
        title="Article de test"
        isUploading={true}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('renders cover image and remove button when imageUrl is provided', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <CoverUploader
        imageUrl="https://cdn.qoe.fi/test-cover.webp"
        title="Super Article"
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={onRemove}
      />
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn.qoe.fi/test-cover.webp');
    expect(img).toHaveAttribute('alt', 'Super Article');

    const removeBtn = screen.getByRole('button', { name: /Supprimer/i });
    await user.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('édite la description de couverture et la bascule décorative', async () => {
    const user = userEvent.setup();
    const onCoverAltChange = vi.fn();
    const onCoverDecorativeChange = vi.fn();

    const { rerender } = render(
      <CoverUploader
        imageUrl="https://cdn.qoe.fi/test-cover.webp"
        title="Super Article"
        coverAlt=""
        coverDecorative={false}
        onCoverAltChange={onCoverAltChange}
        onCoverDecorativeChange={onCoverDecorativeChange}
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const altInput = screen.getByLabelText(/Description de la couverture \(alt\)/i);
    expect(altInput).toBeEnabled();
    await user.type(altInput, 'Une façade au soleil');
    expect(onCoverAltChange).toHaveBeenCalled();

    await user.click(screen.getByLabelText(/Image purement décorative/i));
    expect(onCoverDecorativeChange).toHaveBeenCalledWith(true);

    rerender(
      <CoverUploader
        imageUrl="https://cdn.qoe.fi/test-cover.webp"
        title="Super Article"
        coverAlt="Une façade au soleil"
        coverDecorative
        onCoverAltChange={onCoverAltChange}
        onCoverDecorativeChange={onCoverDecorativeChange}
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Description de la couverture \(alt\)/i)).toBeDisabled();
    expect(document.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('handles drag over, drag leave and drop', () => {
    render(
      <CoverUploader
        imageUrl={null}
        title="Article"
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const container = screen.getByRole('button').closest('div');
    expect(container).toBeInTheDocument();

    if (container) {
      fireEvent.dragOver(container);
      expect(screen.getByText(/Déposez votre image ici/i)).toBeInTheDocument();

      fireEvent.dragLeave(container);
      expect(screen.queryByText(/Déposez votre image ici/i)).not.toBeInTheDocument();
    }
  });

  it('handles file selection via input', () => {
    render(
      <CoverUploader
        imageUrl={null}
        title="Article"
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/Choisir la couverture de l'article/i);
    const file = new File(['dummy-content'], 'cover.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(createObjectURLSpy).toHaveBeenCalled();
  });
});
