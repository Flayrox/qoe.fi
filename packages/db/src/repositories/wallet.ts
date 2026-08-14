// =====================================================================
// 💳 Wallet Repository — Couche d'accès typée pour le portefeuille virtuel
// =====================================================================

import { prisma } from '../client';
import { logger } from '@qoe/observability';
import { getPublicationOwner } from './follows';

/**
 * 💰 Déverrouille un article via le solde du portefeuille virtuel du lecteur.
 * Le propriétaire de la publication (créateur perso OU owner média) est crédité.
 */
export async function unlockArticleWithWallet(
  readerId: string,
  publicationId: string,
  costCents: number = 200
): Promise<{ success: boolean; error?: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: readerId },
        select: { walletBalanceCents: true, email: true },
      });

      if (!dbUser) {
        return { success: false, error: 'USER_NOT_FOUND' };
      }

      if (dbUser.walletBalanceCents < costCents) {
        return { success: false, error: 'INSUFFICIENT_FUNDS' };
      }

      const ownerId = await getPublicationOwner(publicationId);
      if (!ownerId) {
        return { success: false, error: 'PUBLICATION_NOT_FOUND' };
      }

      await tx.user.update({
        where: { id: readerId },
        data: {
          walletBalanceCents: {
            decrement: costCents,
          },
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: readerId,
          amountCents: -costCents,
          type: 'PAYWALL_UNLOCK',
        },
      });

      await tx.user.update({
        where: { id: ownerId },
        data: {
          walletBalanceCents: {
            increment: costCents,
          },
        },
      });

      return { success: true };
    });
  } catch (error) {
    logger.error('Erreur unlock wallet', { err: error }, { capture: true });
    return { success: false, error: 'TRANSACTION_FAILED' };
  }
}

/**
 * 💳 Récupère les informations du portefeuille de l'utilisateur actif.
 */
export async function getUserWallet(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      walletBalanceCents: true,
    },
  });
}
