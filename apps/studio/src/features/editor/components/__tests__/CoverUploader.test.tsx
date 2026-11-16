import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
/** Recadrage et médiathèque : doubles légers, aucun canvas ni réseau. */
vi.mock('@qoe/ui/ui/ImageEditorDialog', () => ({
  ImageEditorDialog: ({
    open,
    src,
    onOpenChange,
    onApply,
  }: {
    open: boolean;
    src: string | null;
    onOpenChange: (open: boolean) => void;
    onApply: (result: { file: File }) => void;
  }) =>
    open ? (
      <div data-testid="crop-dialog" data-src={src ?? ''}>
        <button
          type="button"
          onClick={() =>
            onApply({ file: new File(['cropped'], 'cover.webp', { type: 'image/webp' }) })
          }
        >
          Appliquer le cadrage
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Annuler le cadrage
        </button>
      </div>
    ) : null,
}));

vi.mock('../MediaAssetPickerDialog', () => ({
  MediaAssetPickerDialog: ({
    open,
    onSelect,
  }: {
    open: boolean;
    onSelect: (asset: { id: string; url: string }) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => onSelect({ id: 'asset-1', url: 'https://cdn.qoe.fi/asset.webp' })}
      >
        Choisir cet asset
      </button>
    ) : null,
}));

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

  it('ouvre le recadrage sur le fichier choisi puis envoie l’image recadrée', () => {
    const onUpload = vi.fn();
    render(
      <CoverUploader
        imageUrl={null}
        title="Article"
        isUploading={false}
        onUpload={onUpload}
        onRemove={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/Choisir la couverture de l'article/i);
    fireEvent.change(input, {
      target: { files: [new File(['dummy'], 'cover.png', { type: 'image/png' })] },
    });

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(screen.getByTestId('crop-dialog').getAttribute('data-src')).toBe('blob:mock-url');

    fireEvent.click(screen.getByRole('button', { name: /Appliquer le cadrage/ }));

    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload.mock.calls[0][0]).toBeInstanceOf(File);
    expect(screen.queryByTestId('crop-dialog')).toBeNull();
  });

  it('n’envoie rien si le recadrage est annulé et libère le blob', () => {
    const onUpload = vi.fn();
    render(
      <CoverUploader
        imageUrl={null}
        title="Article"
        isUploading={false}
        onUpload={onUpload}
        onRemove={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Choisir la couverture de l'article/i), {
      target: { files: [new File(['dummy'], 'cover.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Annuler le cadrage/ }));

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('crop-dialog')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('choisit une couverture existante dans la médiathèque', () => {
    const onSelectImage = vi.fn();
    render(
      <CoverUploader
        imageUrl={null}
        title="Article"
        isUploading={false}
        onUpload={vi.fn()}
        onSelectImage={onSelectImage}
        onRemove={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Choisir dans la médiathèque/ }));
    fireEvent.click(screen.getByRole('button', { name: /Choisir cet asset/ }));

    expect(onSelectImage).toHaveBeenCalledWith('https://cdn.qoe.fi/asset.webp');
  });

  it('signale l’alt manquant puis le masque une fois la description saisie', () => {
    const onCoverAltChange = vi.fn();
    const { rerender } = render(
      <CoverUploader
        imageUrl="https://cdn.qoe.fi/cover.webp"
        title="Article"
        coverAlt=""
        onCoverAltChange={onCoverAltChange}
        onCoverDecorativeChange={vi.fn()}
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText(/Alt manquant/)).toBeDefined();

    rerender(
      <CoverUploader
        imageUrl="https://cdn.qoe.fi/cover.webp"
        title="Article"
        coverAlt="Une place vide au petit matin"
        onCoverAltChange={onCoverAltChange}
        onCoverDecorativeChange={vi.fn()}
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.queryByText(/Alt manquant/)).toBeNull();
    expect(document.querySelector('img')).toHaveAttribute('alt', 'Une place vide au petit matin');
  });

  it('bloque les actions de couverture pendant un envoi', () => {
    render(
      <CoverUploader
        imageUrl="https://cdn.qoe.fi/cover.webp"
        title="Article"
        isUploading
        onUpload={vi.fn()}
        onSelectImage={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(
      (screen.getByRole('button', { name: /Changer l'image/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: /Médiathèque/ }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('accepte une image déposée sur la couverture existante', () => {
    render(
      <CoverUploader
        imageUrl="https://cdn.qoe.fi/cover.webp"
        title="Article"
        isUploading={false}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.queryByTestId('crop-dialog')).toBeNull();

    fireEvent.drop(screen.getByRole('img').parentElement as HTMLElement, {
      dataTransfer: { files: [new File(['dummy'], 'drop.png', { type: 'image/png' })] },
    });

    expect(screen.getByTestId('crop-dialog')).toBeDefined();
  });
});
