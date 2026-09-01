// =====================================================================
// 🖼️ Upload d'images (mobile) — avatar & bannière de profil
// =====================================================================
// Miroir mobile de packages/supabase/storage.ts : upload direct vers le
// bucket public `articles-media` via le client utilisateur (même contrat
// que la route web /api/upload), puis réécriture de l'URL publique vers
// le CDN (https://cdn.qoe.fi) quand la plateforme est configurée.
// =====================================================================

import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

// Parité packages/supabase/src/storage.ts : bucket unique des images publiques.
const IMAGES_BUCKET = 'articles-media';

export const IMAGES_CDN = 'https://cdn.qoe.fi';

/** 12 Mo — même limite que le web (media-engine MAX_UPLOAD_BYTES). */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export type ProfileImageKind = 'avatars' | 'banners';

export interface PickedImage {
  uri: string;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Réécrit l'URL publique Supabase vers le CDN public (parité
 * toPublicImageUrl du web, adapté aux variables EXPO_PUBLIC_).
 */
export function toPublicImageUrl(publicUrl: string): string {
  if (env.supabaseUrl && publicUrl.startsWith(env.supabaseUrl)) {
    return publicUrl.replace(env.supabaseUrl, IMAGES_CDN);
  }
  return publicUrl;
}

export function extFromMime(mimeType: string | null | undefined): string {
  const ext = (mimeType ?? '').split('/')[1]?.toLowerCase() ?? '';
  if (ext === 'jpeg') return 'jpg';
  return ext || 'jpg';
}

/**
 * Uploade l'image choisie vers `{folder}/{ownerId}/{ts}-{rand}.{ext}`
 * et retourne l'URL publique (CDN si configuré).
 */
export async function uploadProfileImage(
  image: PickedImage,
  folder: ProfileImageKind,
  ownerId: string
): Promise<string> {
  if (image.fileSize && image.fileSize > MAX_UPLOAD_BYTES) {
    throw new Error('Image trop volumineuse. Taille maximale : 12 Mo.');
  }

  const response = await fetch(image.uri);
  const blob = await response.blob();
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image trop volumineuse. Taille maximale : 12 Mo.');
  }

  const mimeType = image.mimeType || blob.type || 'image/jpeg';
  const ext = extFromMime(mimeType);
  const path = `${folder}/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(IMAGES_BUCKET).upload(path, blob, {
    contentType: mimeType,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    throw new Error(`Échec de l'upload de l'image : ${error.message}`);
  }

  const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
  return toPublicImageUrl(data.publicUrl);
}
