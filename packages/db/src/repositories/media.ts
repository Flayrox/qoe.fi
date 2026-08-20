// =====================================================================
// 🗄️ Media Assets Repository & FinOps Lifecycle Manager (@qoe/db)
// =====================================================================
// Gère le cycle de vie complet des images :
// 1. Dédoublonnage CAS à l'upload (recherche par hash SHA-256)
// 2. Rétention des brouillons orphelins (TTL: 3 jours sous DRAFT_ORPHAN)
// 3. Réconciliation automatique des médias lors de la publication
// 4. Période de grâce de 14 jours lors de la suppression (audit/modération)
// 5. Worker de purge physique des blobs Supabase Storage / R2
// =====================================================================

import { prisma } from '../client';
import type { MediaAssetTargetType, Prisma } from '@prisma/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RegisterMediaInput {
  sha256: string;
  url: string;
  storagePath: string;
  bucket?: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  blurhash?: string;
  ownerId?: string | null;
  targetType?: MediaAssetTargetType;
  isNsfw?: boolean;
  isSensitive?: boolean;
  safetyScores?: Prisma.InputJsonValue;
}

/**
 * 📝 Enregistre un nouvel asset média sous statut DRAFT_ORPHAN (TTL: 3 jours).
 * Si le fichier existe déjà (dédoublonnage SHA-256), réutilise la référence existante.
 */
export async function registerMediaAsset(input: RegisterMediaInput) {
  const existing = await prisma.mediaAsset.findFirst({
    where: { sha256: input.sha256 },
  });

  if (existing) {
    // Si l'asset existait mais avait été purgé, on le réactive
    if (existing.status === 'PURGED' || existing.status === 'SOFT_DELETED') {
      return prisma.mediaAsset.update({
        where: { id: existing.id },
        data: {
          status: 'DRAFT_ORPHAN',
          purgeDueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // +3 jours
          deletedAt: null,
        },
      });
    }
    return existing;
  }

  // Création d'un nouvel asset orphelin (purgé dans 3j si non attaché)
  return prisma.mediaAsset.create({
    data: {
      sha256: input.sha256,
      url: input.url,
      storagePath: input.storagePath,
      bucket: input.bucket || 'articles-media',
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      sizeBytes: input.sizeBytes,
      blurhash: input.blurhash,
      ownerId: input.ownerId,
      targetType: input.targetType || 'SHARED',
      isNsfw: input.isNsfw || false,
      isSensitive: input.isSensitive || false,
      safetyScores: input.safetyScores,
      status: 'DRAFT_ORPHAN',
      purgeDueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // +3 jours
    },
  });
}

/**
 * 🔗 Réconcilie les images utilisées dans un article ou une pensée sauvegardée.
 * Passe leur statut à ATTACHED et annule la date de purge.
 */
export async function reconcileMediaAttachments(
  urls: string[],
  attachedToId: string,
  targetType: MediaAssetTargetType = 'ARTICLE_BODY'
) {
  if (!urls || urls.length === 0) return { count: 0 };

  return prisma.mediaAsset.updateMany({
    where: {
      url: { in: urls },
    },
    data: {
      status: 'ATTACHED',
      attachedToId,
      targetType,
      purgeDueAt: null,
      deletedAt: null,
    },
  });
}

/**
 * 🗑️ Met en corbeille les médias rattachés à un article ou un post supprimé.
 * Rétention de sécurité de 14 jours pour audit de modération / signalements.
 */
export async function markMediaAsSoftDeleted(attachedToId: string, gracePeriodDays = 14) {
  const purgeDueAt = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);

  return prisma.mediaAsset.updateMany({
    where: {
      attachedToId,
      status: 'ATTACHED',
    },
    data: {
      status: 'SOFT_DELETED',
      deletedAt: new Date(),
      purgeDueAt,
    },
  });
}

/**
 * 🧹 Worker de Purge Physique (CRON) :
 * Supprime définitivement du stockage Supabase/R2 les fichiers expirés.
 */
export async function purgeExpiredMediaAssets(supabase: SupabaseClient) {
  const now = new Date();

  // Trouver tous les médias orphelins ou supprimés dont l'échéance est dépassée
  const expiredAssets = await prisma.mediaAsset.findMany({
    where: {
      status: { in: ['DRAFT_ORPHAN', 'SOFT_DELETED'] },
      purgeDueAt: { lte: now },
    },
    take: 100, // Traitement par lots de 100
  });

  if (expiredAssets.length === 0) {
    return { purgedCount: 0, freedBytes: 0 };
  }

  let freedBytes = 0;
  const pathsToDeleteByBucket: Record<string, string[]> = {};

  for (const asset of expiredAssets) {
    freedBytes += asset.sizeBytes;
    if (!pathsToDeleteByBucket[asset.bucket]) {
      pathsToDeleteByBucket[asset.bucket] = [];
    }
    pathsToDeleteByBucket[asset.bucket]!.push(asset.storagePath);
  }

  // 1. Suppression physique dans les buckets Supabase Storage
  for (const [bucket, paths] of Object.entries(pathsToDeleteByBucket)) {
    try {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) {
        console.error(`⚠️ Erreur lors de la purge physique du bucket ${bucket}:`, error);
      }
    } catch (err) {
      console.error(`⚠️ Échec de suppression physique sur le storage:`, err);
    }
  }

  // 2. Mise à jour des statuts en PURGED dans la base de données
  const assetIds = expiredAssets.map((a) => a.id);
  await prisma.mediaAsset.updateMany({
    where: { id: { in: assetIds } },
    data: {
      status: 'PURGED',
      purgeDueAt: null,
    },
  });

  return {
    purgedCount: expiredAssets.length,
    freedBytes,
    assetIds,
  };
}

/**
 * 🔍 Extrait toutes les URLs d'images d'un contenu HTML / TipTap.
 */
export function extractImageUrlsFromHtml(html?: string | null): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}
