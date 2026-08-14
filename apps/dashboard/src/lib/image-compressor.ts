/**
 * 🖼️ Client-Side Image Compressor — modern (Web Worker + WebP)
 * =====================================================================
 * Compresses an image file in the browser before upload to save bandwidth
 * and server space. Uses browser-image-compression (OffscreenCanvas + Web
 * Worker) and encodes output as WebP when supported (fallback JPEG).
 *
 * Features:
 * - Keeps GIFs intact (preserves animation).
 * - Downsizes images to a maximum dimension (default: 1400px).
 * - Modern Web Worker compression (browser-image-compression).
 * - WebP output (best quality/size ratio) with JPEG fallback.
 * =====================================================================
 */

import imageCompression from 'browser-image-compression';

function isWebpSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

interface CompressOptions {
  maxWidthOrHeight?: number;
  quality?: number;
}

export async function compressImage(
  file: File,
  { maxWidthOrHeight = 1400, quality = 0.85 }: CompressOptions = {}
): Promise<File> {
  // If not an image or is a GIF, skip compression to avoid breaking animations
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file;
  }

  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight,
      initialQuality: quality,
      useWebWorker: true,
      fileType: isWebpSupported() ? 'image/webp' : 'image/jpeg',
      maxSizeMB: 10,
    });

    // Only return the compressed file if it's actually smaller than the original
    if (compressed.size < file.size) {
      return compressed;
    }
    return file;
  } catch {
    return file; // Fallback to original file on error
  }
}
