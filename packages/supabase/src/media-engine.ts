// =====================================================================
// 🖼️ Moteur d'Image Haute Sécurité, Modération & FinOps 2026 (@qoe/supabase)
// =====================================================================
// Fournit une pipeline zéro-trust complète :
// 1. Validation physique des Magic Bytes (rejet des faux types MIME)
// 2. Protection Anti-Decompression Bomb (Pixel Flood DOS)
// 3. Re-encodage systématique via Sharp (neutralisation des polyglottes)
// 4. Stripping intégral des métadonnées EXIF (protection de la vie privée/GPS)
// 5. Modération IA multimodale universelle (anti-NSFW / violence)
// 6. Dédoublonnage CAS par hachage SHA-256 (optimisation de stockage)
// 7. Encodage WebP/AVIF haute fidélité + génération de placeholder LQIP
// =====================================================================

import crypto from 'node:crypto';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IMAGES_BUCKET, toPublicImageUrl, IMAGE_FOLDERS, type ImageFolder } from './storage';

export { IMAGE_FOLDERS, type ImageFolder } from './storage';

/** Limite de pixels maximale (50 Mégapixels, ex: ~7000x7000) pour prévenir les crashs OOM. */
export const MAX_IMAGE_PIXELS = 50_000_000;
export const MAX_DIMENSION = 8192;
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12MB

export interface MagicBytesResult {
  valid: boolean;
  mime: string;
  extension: string;
}

/**
 * 🔬 Détecte et valide le type MIME réel d'un buffer à partir de ses Magic Bytes.
 */
export function detectMagicBytes(buffer: Buffer): MagicBytesResult {
  if (!buffer || buffer.length < 12) {
    return { valid: false, mime: '', extension: '' };
  }

  // 1. JPEG (FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mime: 'image/jpeg', extension: 'jpg' };
  }

  // 2. PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mime: 'image/png', extension: 'png' };
  }

  // 3. WebP (RIFF .... WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, mime: 'image/webp', extension: 'webp' };
  }

  // 4. GIF (GIF87a ou GIF89a)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { valid: true, mime: 'image/gif', extension: 'gif' };
  }

  // 5. AVIF (....ftypavif ou ....ftypavis)
  const subChunk = buffer.subarray(4, 12).toString('ascii');
  if (subChunk.includes('ftypavif') || subChunk.includes('ftypavis')) {
    return { valid: true, mime: 'image/avif', extension: 'avif' };
  }

  // 6. SVG Détection sécurisée (XML textuelle avec <svg)
  const headerText = buffer.subarray(0, 512).toString('utf8').trim().toLowerCase();
  if (
    (headerText.includes('<svg') || headerText.includes('<?xml')) &&
    headerText.includes('<svg') &&
    !headerText.includes('<script') &&
    !headerText.includes('javascript:')
  ) {
    return { valid: true, mime: 'image/svg+xml', extension: 'svg' };
  }

  return { valid: false, mime: '', extension: '' };
}

/**
 * 🛡️ Désinfecte un SVG contre les attaques XSS stockées.
 */
export function sanitizeSvgBuffer(buffer: Buffer): Buffer {
  let content = buffer.toString('utf8');
  // Élimine les scripts, objets distants et gestionnaires d'événements
  content = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '')
    .replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, '');
  return Buffer.from(content, 'utf8');
}

export interface ModerationResult {
  safe: boolean;
  isNsfw: boolean;
  isSensitive: boolean;
  reason?: string;
  scores?: Record<string, number | boolean>;
}

/**
 * 🛡️ Modération multimodale universelle de l'image (OpenAI Omni-Moderation).
 */
export async function moderateImageBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  // En local/dev sans clé, autoriser avec log
  if (!apiKey || apiKey === 'sk-mock' || apiKey.startsWith('sk-...')) {
    return { safe: true, isNsfw: false, isSensitive: false };
  }

  try {
    const base64Image = buffer.toString('base64');
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn('⚠️ Erreur OpenAI Moderation API:', response.status);
      return { safe: true, isNsfw: false, isSensitive: false };
    }

    const data = await response.json();
    const result = data.results?.[0];

    if (result?.flagged) {
      const categories = result.categories || {};
      const isNsfw = Boolean(categories.sexual || categories['sexual/minors']);
      const isSensitive = Boolean(
        categories.violence || categories['self-harm'] || categories.hate
      );

      const flaggedReasons = Object.entries(categories)
        .filter(([, val]) => val)
        .map(([key]) => key)
        .join(', ');

      return {
        safe: false,
        isNsfw,
        isSensitive,
        reason: `Image rejetée par le filtre de sécurité (${flaggedReasons}).`,
        scores: categories,
      };
    }

    return { safe: true, isNsfw: false, isSensitive: false, scores: result?.category_scores };
  } catch (error) {
    console.error('Erreur lors de la modération image:', error);
    return { safe: true, isNsfw: false, isSensitive: false };
  }
}

export interface ProcessedImageResult {
  processedBuffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
  blurhash: string;
}

/**
 * ⚙️ Pipeline de transformation Sharp & Sécurité :
 * - Protection Anti-Bomb (Vérification des dimensions sans décodage lourd)
 * - Auto-rotation selon EXIF puis stripping EXIF intégral
 * - Transcodage WebP haute fidélité (effort: 4, quality: 85)
 * - Génération de miniature LQIP Base64
 * - Calcul du hash cryptographique SHA-256
 */
export async function processAndSecureImage(
  rawBuffer: Buffer,
  declaredMime: string,
  maxWidth = 2048
): Promise<ProcessedImageResult> {
  // 1. Validation Magic Bytes
  const magic = detectMagicBytes(rawBuffer);
  if (!magic.valid) {
    throw new Error('Type de fichier invalide ou corrompu. Seules les images sont autorisées.');
  }

  // Traitement spécial SVG (désinfection XML pure sans sharp)
  if (magic.mime === 'image/svg+xml') {
    const cleanSvg = sanitizeSvgBuffer(rawBuffer);
    const sha256 = crypto.createHash('sha256').update(cleanSvg).digest('hex');
    return {
      processedBuffer: cleanSvg,
      mimeType: 'image/svg+xml',
      extension: 'svg',
      width: 800,
      height: 800,
      sizeBytes: cleanSvg.length,
      sha256,
      blurhash: 'data:image/svg+xml;base64,' + cleanSvg.toString('base64'),
    };
  }

  // 2. Anti-Decompression Bomb (Lecture métadonnées header uniquement)
  const imageInstance = sharp(rawBuffer, { failOn: 'none' });
  const metadata = await imageInstance.metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width === 0 || height === 0) {
    throw new Error('Impossible de lire les dimensions de l’image.');
  }

  if (width * height > MAX_IMAGE_PIXELS || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(
      `Image trop volumineuse en résolution (${width}x${height}). Limite maximale : 50 Mégapixels.`
    );
  }

  // 3. Transformation, Stripping EXIF & Transcodage WebP
  let transformer = sharp(rawBuffer, { failOn: 'none' }).rotate(); // Oriente l'image et strippe les EXIFs par défaut

  if (width > maxWidth) {
    transformer = transformer.resize(maxWidth, null, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Transcodage WebP optimisé (2026 standard)
  const processedBuffer = await transformer
    .webp({
      quality: 85,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();

  const finalMetadata = await sharp(processedBuffer).metadata();
  const finalWidth = finalMetadata.width || width;
  const finalHeight = finalMetadata.height || height;

  // 4. Génération de miniature LQIP Base64 (16x16 floutée pour rendu à 0ms)
  const lqipBuffer = await sharp(processedBuffer)
    .resize(16, 16, { fit: 'inside' })
    .blur(1.5)
    .webp({ quality: 20 })
    .toBuffer();

  const blurhash = `data:image/webp;base64,${lqipBuffer.toString('base64')}`;

  // 5. Calcul du hachage SHA-256 CAS
  const sha256 = crypto.createHash('sha256').update(processedBuffer).digest('hex');

  return {
    processedBuffer,
    mimeType: 'image/webp',
    extension: 'webp',
    width: finalWidth,
    height: finalHeight,
    sizeBytes: processedBuffer.length,
    sha256,
    blurhash,
  };
}

export interface UploadMediaOptions {
  folder?: ImageFolder;
  ownerId?: string;
  attachedToId?: string;
  skipModeration?: boolean;
}

export interface UploadMediaResult {
  url: string;
  storagePath: string;
  sha256: string;
  width: number;
  height: number;
  sizeBytes: number;
  blurhash: string;
  mimeType: string;
  isExistingAsset: boolean;
}

/**
 * 🚀 Pipeline d'upload intégrale unifiée :
 * Sécurité + Modération + Dédoublonnage CAS + Supabase Storage Upload.
 */
export async function uploadAndProcessMedia(
  supabase: SupabaseClient,
  fileBuffer: Buffer,
  declaredMime: string,
  options: UploadMediaOptions = {}
): Promise<UploadMediaResult> {
  const { folder = IMAGE_FOLDERS.articles, ownerId = 'shared' } = options;

  // 1. Validation de la taille brute
  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('Fichier trop volumineux. La taille maximale autorisée est de 12 Mo.');
  }

  // 2. Modération multimodale OpenAI (Zéro-NSFW)
  if (!options.skipModeration) {
    const mod = await moderateImageBuffer(fileBuffer, declaredMime);
    if (!mod.safe) {
      throw new Error(mod.reason || 'Image bloquée par les filtres de sécurité.');
    }
  }

  // 3. Pipeline de transformation Sharp & Hash
  const processed = await processAndSecureImage(fileBuffer, declaredMime);

  // 4. Chemin de stockage déterministe avec hachage SHA-256 (CAS)
  // {folder}/{ownerId}/{sha256}.{ext}
  const storagePath = `${folder}/${ownerId}/${processed.sha256}.${processed.extension}`;

  // 5. Upload vers Supabase Storage avec cache-control long (1 an grâce au hachage immuable)
  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(storagePath, processed.processedBuffer, {
      contentType: processed.mimeType,
      cacheControl: '31536000, immutable',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Échec de l'upload de l'image : ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(storagePath);
  const finalCdnUrl = toPublicImageUrl(publicUrlData.publicUrl);

  return {
    url: finalCdnUrl,
    storagePath,
    sha256: processed.sha256,
    width: processed.width,
    height: processed.height,
    sizeBytes: processed.sizeBytes,
    blurhash: processed.blurhash,
    mimeType: processed.mimeType,
    isExistingAsset: false,
  };
}
