'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import type { ImageEditorResult } from '@qoe/ui/ui/ImageEditorDialog';
import { generateComposerUuid, type ComposerImage, type PendingImageImport } from './types';

export function useComposerImages(onErrorCleared: () => void) {
  const [images, setImages] = useState<ComposerImage[]>([]);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);
  const [croppingImage, setCroppingImage] = useState<ComposerImage | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImageImport | null>(null);

  const pendingImportSrc = pendingImport?.src;
  useEffect(() => {
    if (!pendingImportSrc) return;
    return () => URL.revokeObjectURL(pendingImportSrc);
  }, [pendingImportSrc]);

  const addPreparedImages = (files: File[], replaceId?: string) => {
    if (files.length === 0) return;

    if (replaceId) {
      const [file] = files;
      const url = URL.createObjectURL(file);
      setImages((prev) =>
        prev.map((img) => {
          if (img.id !== replaceId) return img;
          if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
          return { ...img, url, file };
        })
      );
      return;
    }

    const additions = files.map((file) => ({
      id: generateComposerUuid(),
      url: URL.createObjectURL(file),
      file,
    }));
    setImages((prev) => [...prev, ...additions]);
  };

  const queueImageImport = (files: File[], replaceId?: string) => {
    const incoming = files.filter((file) => file.type.startsWith('image/'));
    if (incoming.length === 0) return;

    const accepted: File[] = [];
    for (const file of incoming) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`L'image ${file.name} dépasse la limite de 8 Mo.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    if (replaceId && accepted.length > 1) accepted.length = 1;
    if (!replaceId && images.length + accepted.length > 4) {
      toast.error(t`Vous pouvez ajouter jusqu'à 4 images maximum par post.`);
      return;
    }

    onErrorCleared();
    setPendingImport({
      files: accepted,
      index: 0,
      results: [],
      replaceId,
      src: URL.createObjectURL(accepted[0]),
    });
  };

  const handleImportApply = ({ file }: ImageEditorResult) => {
    const current = pendingImport;
    if (!current) return;

    const results = [...current.results, file];
    const nextIndex = current.index + 1;
    if (nextIndex < current.files.length) {
      setPendingImport({
        ...current,
        index: nextIndex,
        results,
        src: URL.createObjectURL(current.files[nextIndex]),
      });
      return;
    }

    setPendingImport(null);
    setReplacingImageId(null);
    addPreparedImages(results, current.replaceId);
  };

  const handlePostImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) queueImageImport(files);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      queueImageImport(files);
    }
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && replacingImageId) queueImageImport([file], replacingImageId);
    e.target.value = '';
  };

  const moveImage = (index: number, direction: 'left' | 'right') => {
    const nextIndex = direction === 'left' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= images.length) return;

    setImages((prev) => {
      const newImages = [...prev];
      const temp = newImages[index];
      newImages[index] = newImages[nextIndex];
      newImages[nextIndex] = temp;
      return newImages;
    });
  };

  const updateImageAlt = (id: string, altText: string) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, altText } : img)));
  };

  const removeImage = (id: string) => {
    const target = images.find((img) => img.id === id);
    if (target && target.url.startsWith('blob:')) {
      URL.revokeObjectURL(target.url);
    }
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const applyCroppedImage = (id: string, croppedUrl: string, croppedFile: File) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, url: croppedUrl, file: croppedFile } : img))
    );
    setCroppingImage(null);
    toast.success(t`Image recadrée avec succès.`);
  };

  const startReplaceImage = (id: string) => {
    setReplacingImageId(id);
    replaceInputRef.current?.click();
  };

  const cancelPendingImport = () => {
    setPendingImport(null);
    setReplacingImageId(null);
  };

  return {
    images,
    setImages,
    replaceInputRef,
    croppingImage,
    setCroppingImage,
    pendingImport,
    handleImportApply,
    cancelPendingImport,
    handlePostImageUpload,
    handlePaste,
    handleReplaceImage,
    moveImage,
    updateImageAlt,
    removeImage,
    applyCroppedImage,
    startReplaceImage,
  };
}
