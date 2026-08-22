// =====================================================================
// 🖼️ Seed Images — Upload des fixtures locales vers le storage Supabase
// =====================================================================
// Garantit que le seed n'utilise AUCUNE image externe (Unsplash/DiceBear).
// Les fichiers de `prisma/fixtures/` sont uploadés une seule fois (upsert)
// dans les buckets du Supabase local (CLI) ou self-hosté (Kong), et les
// URLs publiques générées pointent toujours vers ce storage.
//
// Prérequis : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

/** Buckets utilisés par l'app (cf. packages/supabase/src/storage.ts & schema.prisma). */
export const SEED_BUCKETS = {
  userMedia: 'user-media',
  mediaBranding: 'media-branding',
  articlesMedia: 'articles-media',
} as const;

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(
  /\/$/,
  ''
);
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function mimeFor(file: string): string {
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

async function ensureBucket(bucket: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  // 400 "Duplicate" / 409 : le bucket existe déjà → OK.
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => '');
    if (!/duplicate|already exists/i.test(text)) {
      throw new Error(`Création du bucket "${bucket}" impossible (${res.status}) : ${text}`);
    }
  }
}

async function uploadFile(bucket: string, objectPath: string, filePath: string): Promise<string> {
  const body = fs.readFileSync(filePath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': mimeFor(filePath),
      'x-upsert': 'true',
      'Cache-Control': '31536000',
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload de ${bucket}/${objectPath} échoué (${res.status}) : ${text}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}

/**
 * Construit l'URL publique d'un objet déjà présent dans le storage du seed
 * (uploadé par createSeedImages / seed-large). Sans upload ni réseau.
 */
export function seededPublicUrl(bucket: string, objectPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}

interface UploadedImage {
  url: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Upload toutes les fixtures (une fois par fichier, upsert) et retourne un
 * accès déterministe par index (modulo) pour le seed.
 */
export async function createSeedImages() {
  if (!SERVICE_KEY) {
    throw new Error(
      "[seed-images] SUPABASE_SERVICE_ROLE_KEY manquant : impossible d'uploader les images du seed."
    );
  }

  for (const bucket of Object.values(SEED_BUCKETS)) {
    await ensureBucket(bucket);
  }

  const uploadDir = async (
    dirName: string,
    bucket: string,
    prefix: string
  ): Promise<UploadedImage[]> => {
    const dir = path.join(FIXTURES_DIR, dirName);
    const files = fs
      .readdirSync(dir)
      .filter((f) => !f.startsWith('.'))
      .sort();
    const uploaded: UploadedImage[] = [];
    for (const file of files) {
      const filePath = path.join(dir, file);
      const url = await uploadFile(bucket, `${prefix}/${file}`, filePath);
      uploaded.push({
        url,
        mimeType: mimeFor(file),
        width: dirName === 'banners' ? 1600 : 512,
        height: dirName === 'banners' ? 400 : 512,
        sizeBytes: fs.statSync(filePath).size,
      });
    }
    return uploaded;
  };

  // Avatars & bannières utilisateur → user-media
  const avatars = await uploadDir('avatars', SEED_BUCKETS.userMedia, 'seed/avatars');
  const banners = await uploadDir('banners', SEED_BUCKETS.userMedia, 'seed/banners');
  // Logos & bannières médias → media-branding
  const logos = await uploadDir('logos', SEED_BUCKETS.mediaBranding, 'seed/logos');
  const mediaBanners = await uploadDir('banners', SEED_BUCKETS.mediaBranding, 'seed/banners');
  void mediaBanners;
  // Photos réelles (covers articles, pièces jointes pensées) → articles-media
  const covers = await uploadDir('covers', SEED_BUCKETS.articlesMedia, 'seed/covers');

  const cycle = <T>(arr: T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length];

  return {
    /** Avatar utilisateur SVG (512×512). */
    avatar: (i: number): UploadedImage => cycle(avatars, i),
    /** Bannière utilisateur SVG (1600×400). */
    banner: (i: number): UploadedImage => cycle(banners, i),
    /** Logo média SVG sur fond sombre (512×512). */
    logo: (i: number): UploadedImage => cycle(logos, i),
    /** Bannière média SVG (1600×400). */
    mediaBanner: (i: number): UploadedImage => cycle(mediaBanners, i),
    /** Photo réelle de couverture d'article (1200×675 JPEG). */
    cover: (i: number): UploadedImage => {
      const img = cycle(covers, i);
      return { ...img, width: 1200, height: 675 };
    },
  };
}

export type SeedImages = Awaited<ReturnType<typeof createSeedImages>>;
