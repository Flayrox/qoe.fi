// =====================================================================
// 🗄️ Storage — Upload & URLs d'images Supabase Storage (self-hosted)
// =====================================================================
// Centralise l'upload d'images et la réécriture d'URL publique vers le
// CDN (https://cdn.qoe.fi). Utilisé par les routes d'upload des apps.
//
// Le client est passé en paramètre (browser ou server) pour rester
// agnostique ; le bucket est unique (`articles-media`).
// =====================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Bucket unique de stockage des images publiques. */
export const IMAGES_BUCKET = 'articles-media';

/** CDN public pour les images (rewrite de l'URL Supabase). */
export const IMAGES_CDN = 'https://cdn.qoe.fi';

/** Dossiers par type de média. */
export const IMAGE_FOLDERS = {
  avatars: 'avatars',
  banners: 'banners',
  articles: 'articles',
  thoughts: 'thoughts',
} as const;

export type ImageFolder = (typeof IMAGE_FOLDERS)[keyof typeof IMAGE_FOLDERS];

export interface UploadImageOptions {
  folder?: ImageFolder;
  /** Identifiant propriétaire (userId ou publicationId) pour l'isolation. */
  ownerId?: string;
  /** Format de sortie : 'webp' force la conversion, sinon extension d'origine. */
  ext?: string;
}

/**
 * Génère un chemin unique pour un upload :
 * `{folder}/{ownerId}/{timestamp}-{random}.{ext}`
 */
export function buildImagePath(file: File, options: UploadImageOptions = {}): string {
  const { folder = IMAGE_FOLDERS.articles, ownerId = 'shared', ext } = options;
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const fileExt = ext || file.name.split('.').pop() || 'png';
  return `${folder}/${ownerId}/${timestamp}-${randomString}.${fileExt}`;
}

/**
 * Réécrit l'URL publique Supabase vers le CDN public.
 */
export function toPublicImageUrl(publicUrl: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && publicUrl.startsWith(supabaseUrl)) {
    return publicUrl.replace(supabaseUrl, IMAGES_CDN);
  }
  return publicUrl;
}

/**
 * Client-side helper : POST un fichier vers une route d'upload (Next.js)
 * et retourne l'URL finale (CDN). Utilisé par ImageUploader et les éditeurs.
 */
export async function uploadImageToRoute(
  file: File,
  endpoint: string,
  folder?: ImageFolder
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  if (folder) formData.append('folder', folder);

  const res = await fetch(endpoint, { method: 'POST', body: formData });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

  if (!res.ok || !data.url) {
    throw new Error(data.error || "Échec de l'upload de l'image");
  }
  return data.url;
}

/**
 * Upload une image vers le bucket public et retourne l'URL publique CDN.
 */
export async function uploadImage(
  supabase: SupabaseClient,
  file: File,
  options: UploadImageOptions = {}
): Promise<string> {
  const filePath = buildImagePath(file, options);

  const { error } = await supabase.storage.from(IMAGES_BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(filePath);
  return toPublicImageUrl(data.publicUrl);
}
