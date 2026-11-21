'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { ImageEditorDialog, type ImageEditorResult } from '@qoe/ui/ui/ImageEditorDialog';
import { THOUGHT_IMAGE_PRESETS, type ComposerImage } from './types';

interface ImageCropOverlayProps {
  image: ComposerImage;
  onClose: () => void;
  onConfirm: (croppedUrl: string, croppedFile: File) => void;
}

/**
 * Adaptation du recadreur partagé (`ImageEditorDialog`) au format « pensée » :
 * on ne redessine pas de modale ici, on ne fait que fixer les préréglages et
 * relayer le résultat. D'où le nom `Overlay` et non `Modal` — ce fichier
 * n'est pas une primitive réinventée, c'est un câblage.
 */
export function ImageCropOverlay({ image, onClose, onConfirm }: ImageCropOverlayProps) {
  const handleApply = ({ file }: ImageEditorResult) => {
    onConfirm(URL.createObjectURL(file), file);
  };

  return (
    <ImageEditorDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      src={image.url}
      fileName={image.file?.name}
      presets={THOUGHT_IMAGE_PRESETS}
      initialPresetId="thought-4-3"
      title={t`Recadrer l’image`}
      description={t`Choisissez le format, ajustez le cadrage et vérifiez l’aperçu avant de confirmer.`}
      onApply={handleApply}
    />
  );
}
