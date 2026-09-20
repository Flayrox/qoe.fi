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

/** Dossiers valides (garde runtime : une valeur hors allowlist retombe sur `articles`). */
const KNOWN_FOLDERS = new Set<string>(Object.values(IMAGE_FOLDERS));

export interface UploadImageOptions {
  folder?: ImageFolder;
  /** Identifiant propriétaire (userId ou publicationId) pour l'isolation. */
  ownerId?: string;
  /** Format de sortie : 'webp' force la conversion, sinon extension d'origine. */
  ext?: string;
}

/**
 * Assainit un segment de chemin storage : le nom de fichier fourni par le
 * client peut contenir n'importe quoi (`../`, unicode, extensions
 * exotiques…). Ne conserve que `[a-zA-Z0-9._-]`, tronque, jamais vide.
 */
export function sanitizePathSegment(segment: string, fallback = 'shared'): string {
  const clean = (segment || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return clean || fallback;
}

/**
 * Assainit une extension de fichier : minuscules, alphanumérique, 8 car
 * max. Tout le reste (vide, `svg+xml`, `exe`, traversal…) → fallback.
 */
export function sanitizeExtension(ext: string | undefined | null, fallback = 'png'): string {
  const clean = (ext || '').trim().toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(clean) ? clean : fallback;
}

/**
 * Génère un chemin unique pour un upload :
 * `{folder}/{ownerId}/{timestamp}-{random}.{ext}`
 *
 * Le dossier est borné à l'allowlist, l'ownerId et l'extension assainis :
 * aucun fragment client-provided ne peut traverser (`../`) ni forger
 * d'extension exécutable.
 */
export function buildImagePath(file: File, options: UploadImageOptions = {}): string {
  const { folder = IMAGE_FOLDERS.articles, ownerId = 'shared', ext } = options;
  const safeFolder = KNOWN_FOLDERS.has(folder) ? folder : IMAGE_FOLDERS.articles;
  const safeOwner = sanitizePathSegment(ownerId);
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const rawExt = ext ?? file.name.split('.').pop();
  const fileExt = sanitizeExtension(rawExt);
  return `${safeFolder}/${safeOwner}/${timestamp}-${randomString}.${fileExt}`;
}

/**
 * Réécrit l'URL publique Supabase vers le CDN public.
 */
export function toPublicImageUrl(publicUrl: string): string {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
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

  // Une réponse non-JSON (502/504 d'un reverse proxy, page d'erreur HTML, image
  // docker non déployée…) provoquait un message générique impossible à
  // diagnostiquer : on remonte systématiquement le statut HTTP et le début du
  // corps pour que l'erreur affichée soit exploitable.
  const raw = await res.text();
  let data: { url?: string; error?: string } = {};
  try {
    data = JSON.parse(raw) as { url?: string; error?: string };
  } catch {
    data = { error: raw.trim().slice(0, 300) };
  }

  if (!res.ok || !data.url) {
    const detail = data.error ? ` — ${data.error}` : '';
    throw new Error(
      `Échec de l'upload de l'image (HTTP ${res.status}${detail ? '' : ' sans détail'})${detail}`
    );
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
