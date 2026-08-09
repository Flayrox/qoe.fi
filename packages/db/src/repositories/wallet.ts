// =====================================================================
// 💳 Wallet Repository — Couche d'accès typée pour le portefeuille virtuel
// =====================================================================

import { prisma } from "../client";

/**
 * 💰 Déverrouille un article créateur via le solde du portefeuille virtuel du lecteur.
 */
export async function unlockArticleWithWallet(
  readerId: string,
  creatorId: string,
  costCents: number = 200
): Promise<{ success: boolean; error?: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: readerId },
        select: { walletBalanceCents: true, email: true },
      });

      if (!dbUser) {
        return { success: false, error: "USER_NOT_FOUND" };
      }

      if (dbUser.walletBalanceCents < costCents) {
        return { success: false, error: "INSUFFICIENT_FUNDS" };
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
          type: "PAYWALL_UNLOCK",
        },
      });

      await tx.user.update({
        where: { id: creatorId },
        data: {
          walletBalanceCents: {
            increment: costCents,
          },
        },
      });

      return { success: true };
    });
  } catch (error) {
    console.error("Error in unlockArticleWithWallet repository:", error);
    return { success: false, error: "TRANSACTION_FAILED" };
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
      subdomain: true,
      customDomain: true,
      walletBalanceCents: true,
    },
  });
}
