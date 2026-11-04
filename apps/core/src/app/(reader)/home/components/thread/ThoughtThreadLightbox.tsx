'use client';

import React from 'react';
import { Dialog, DialogContent } from '@qoe/ui/dialog';
import { useThoughtThreadContext } from './ThoughtThreadContext';

export function ThoughtThreadLightbox() {
  const { lightboxImage, setLightboxImage } = useThoughtThreadContext();

  return (
    <Dialog
      open={Boolean(lightboxImage)}
      onOpenChange={(open) => {
        if (!open) setLightboxImage(null);
      }}
    >
      <DialogContent
        size="lg"
        aria-label="Aperçu de l’image"
        className="w-auto max-w-[92vw] border-border/40 bg-card/95 p-2 backdrop-blur-md"
      >
        {lightboxImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lightboxImage}
            alt=""
            className="max-h-[85vh] max-w-full rounded-panel object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
