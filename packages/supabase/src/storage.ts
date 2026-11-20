// =====================================================================
// 🗄️ Storage — Upload & URLs d'images Supabase Storage (self-hosted)
// =====================================================================
// Centralise l'upload d'images et la réécriture d'URL publique vers le CDN.
// Utilisé par les routes d'upload des apps.
//
// 🔌 Portabilité (règle « self-hosted d'abord, CDN interchangeable ») :
//   Supabase Storage et le CDN sont désignés par des variables d'environnement
//   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_MEDIA_CDN_URL`). Le défaut
//   `https://cdn.qoe.fi` n'est qu'un fallback : basculer sur Bunny, Cloudflare
//   ou imgproxy doit se faire sans toucher au code.
//
// Le client est passé en paramètre (browser ou server) pour rester
// agnostique ; le bucket est unique (`articles-media`).
// =====================================================================

import { resolveSupabaseUrl } from './url';

/** Bucket unique de stockage des images publiques. */
export const IMAGES_BUCKET = 'articles-media';

/** Variable d'environnement qui désigne l'origine publique des médias. */
export const MEDIA_CDN_ENV = 'NEXT_PUBLIC_MEDIA_CDN_URL';

/** Fallback historique (self-hosted Caddy → CDN qoe.fi). */
export const DEFAULT_IMAGES_CDN = 'https://cdn.qoe.fi';

/** @deprecated Utiliser `resolveMediaCdnBase()` : l'origine est configurable. */
export const IMAGES_CDN = DEFAULT_IMAGES_CDN;

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
  /** Identifiant propriétaire (userId ou publisherId) pour l'isolation. */
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
 * 🧭 Origine publique des médias (CDN ou bucket direct).
 *
 * Lue à l'appel (et non à l'import) pour que les tests, les scripts et un
 * changement d'hôte au déploiement soient pris en compte. Une valeur vide ou
 * blanche retombe sur le défaut historique.
 */
export function resolveMediaCdnBase(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env[MEDIA_CDN_ENV] || '').trim();
  return (configured || DEFAULT_IMAGES_CDN).replace(/\/+$/, '');
}

// =====================================================================
// 🖼️ Hôtes d'images — une seule liste pour `next/image` ET pour l'UI
// =====================================================================
// 📖 Deux endroits décidaient si une image distante est optimisable : les
//    `remotePatterns` de chaque `next.config.ts` (recopiés à la main dans
//    cinq apps) et `canOptimizeImageSrc()` côté `@qoe/ui`. Les deux listes
//    étaient figées sur `cdn.qoe.fi` : basculer `NEXT_PUBLIC_MEDIA_CDN_URL`
//    vers Bunny/Cloudflare ne changeait donc RIEN au rendu (l'image restait
//    `unoptimized`, en silence) et le pattern manquait dans Next.
//
// 🎯 Une seule source, pilotée par l'environnement : l'origine média
//    configurée et l'origine Supabase sont ajoutées aux hôtes reconnus ; les
//    hôtes historiques restent acceptés pour que les URLs déjà en base
//    continuent d'être servies après un basculement.
// =====================================================================

/** Hôtes d'images reconnus sans configuration (tiers + historique média). */
export const STATIC_IMAGE_HOSTS = [
  '**.supabase.co',
  'auth.qoe.fi',
  'lh3.googleusercontent.com',
  'avatars.githubusercontent.com',
  'res.cloudinary.com',
  // CDN historique : les URLs déjà stockées en base restent optimisables
  // même après un basculement d'origine (idempotence du rewrite).
  'cdn.qoe.fi',
  '**.r2.dev',
] as const;

/** Hôtes locaux (Supabase Storage de dev), servis en HTTP. */
export const LOCAL_IMAGE_HOSTS = ['127.0.0.1', 'localhost', 'host.docker.internal'] as const;

/** Forme structurelle de `images.remotePatterns` (sans dépendre de `next`). */
export interface MediaRemotePattern {
  protocol: 'http' | 'https';
  hostname: string;
}

/** Hôte d'une URL absolue, ou `''` si l'URL est absente/illisible. */
function imageHostname(value?: string | null): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Motifs d'hôtes acceptés pour une image distante : locaux + tiers connus +
 * origine média configurée + origine Supabase configurée.
 */
export function mediaImageHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const hosts = new Set<string>([...LOCAL_IMAGE_HOSTS, ...STATIC_IMAGE_HOSTS]);
  const cdn = imageHostname(resolveMediaCdnBase(env));
  if (cdn) hosts.add(cdn);
  // Résolue comme les clients : un build local n'autorise pas l'hôte Supabase
  // de production dans `images.remotePatterns`.
  const supabase = imageHostname(
    resolveSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_APP_URL)
  );
  if (supabase) hosts.add(supabase);
  return [...hosts];
}

/**
 * Vrai si `hostname` correspond à un motif (`**.domaine` = domaine + sous-
 * domaines), insensible à la casse.
 */
export function matchesImageHost(
  hostname: string,
  patterns: readonly string[] = mediaImageHosts()
): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  return patterns.some((pattern) => {
    const candidate = pattern.trim().toLowerCase();
    if (!candidate) return false;
    if (candidate.startsWith('**.')) {
      const base = candidate.slice(3);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === candidate;
  });
}

/**
 * Décide si une image distante peut passer par l'optimiseur Next.
 *
 * Les hôtes locaux sont acceptés en HTTP (dev), tout le reste exige HTTPS :
 * un CDN configuré en `http://` ne doit pas se retrouver servi en clair.
 */
export function isOptimizableImageHost(
  hostname: string,
  protocol: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const hosts = mediaImageHosts(env);
  if (!matchesImageHost(hostname, hosts)) return false;
  if (protocol === 'https:') return true;
  if (protocol !== 'http:') return false;
  return LOCAL_IMAGE_HOSTS.some((local) => local === hostname.trim().toLowerCase());
}

/**
 * `images.remotePatterns` de Next, dérivés de l'environnement.
 *
 * Les cinq apps importaient cette liste recopiée à la main ; elles appellent
 * désormais cette fonction, donc changer de CDN ne demande plus de toucher au
 * code (règle « CDN interchangeable » d'`AGENTS.md`).
 */
export function mediaRemotePatterns(env: NodeJS.ProcessEnv = process.env): MediaRemotePattern[] {
  const patterns = new Map<string, MediaRemotePattern>();
  const add = (protocol: 'http' | 'https', hostname: string) => {
    const key = `${protocol}://${hostname.toLowerCase()}`;
    if (!patterns.has(key)) patterns.set(key, { protocol, hostname });
  };

  for (const host of LOCAL_IMAGE_HOSTS) add('http', host);
  for (const host of STATIC_IMAGE_HOSTS) add('https', host);

  const configured = [
    imageHostname(resolveMediaCdnBase(env)),
    imageHostname(resolveSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_APP_URL)),
  ];
  for (const host of configured) {
    if (!host) continue;
    // Une origine locale configurée reste servie en HTTP, comme les hôtes ci-dessus.
    add(LOCAL_IMAGE_HOSTS.some((local) => local === host) ? 'http' : 'https', host);
  }

  return [...patterns.values()];
}

/**
 * Réécrit l'URL publique Supabase vers l'origine média configurée.
 *
 * Idempotent : une URL déjà réécrite (ancien CDN ou CDN courant) est rendue
 * telle quelle, sinon un basculement de CDN casserait les URLs déjà en base.
 */
export function toPublicImageUrl(publicUrl: string): string {
  if (!publicUrl) return publicUrl;
  const supabaseUrl = resolveSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_APP_URL
  ).replace(/\/+$/, '');
  if (supabaseUrl && publicUrl.startsWith(supabaseUrl)) {
    return publicUrl.replace(supabaseUrl, resolveMediaCdnBase());
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
  folder?: ImageFolder,
  /** Permet d'annuler un envoi en cours (galerie longue). */
  options: { signal?: AbortSignal } = {}
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  if (folder) formData.append('folder', folder);

  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
    signal: options.signal,
  });

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
