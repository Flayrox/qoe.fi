'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { ImageEditorDialog, type ImageEditorResult } from '@qoe/ui/ui/ImageEditorDialog';
import { THOUGHT_IMAGE_PRESETS, type ComposerImage } from './types';

interface ImageCropperModalProps {
  image: ComposerImage;
  onClose: () => void;
  onConfirm: (croppedUrl: string, croppedFile: File) => void;
}

export function ImageCropperModal({ image, onClose, onConfirm }: ImageCropperModalProps) {
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
