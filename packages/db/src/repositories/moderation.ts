// =====================================================================
// 🛡️ Moderation Repository — Gestion des Signalements et Modération
// =====================================================================

import { prisma } from "../client";

export interface CreateReportInput {
  reporterId: string;
  targetId: string;
  targetType: "thought" | "article" | "user" | "comment";
  reason: string;
  details?: string | null;
}

/**
  * 🚨 Crée un signalement de modération persistant dans la BDD.
  */
export async function createReport(data: CreateReportInput) {
  const report = await (prisma as any).moderationReport.create({
    data: {
      reporterId: data.reporterId,
      targetId: data.targetId,
      targetType: data.targetType,
      reason: data.reason,
      details: data.details || null,
      status: "pending",
    },
  });

  return report;
}

/**
  * 🔍 Récupère la liste des signalements en attente (pour le dashboard admin).
  */
export async function getPendingReports(limit = 50) {
  return (prisma as any).moderationReport.findMany({
    where: { status: "pending" },
    include: {
      reporter: {
        select: { id: true, name: true, username: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
  * 🚫 Bloque ou débloque un utilisateur (Bluesky Block).
  */
export async function toggleBlockUser(creatorId: string, readerId: string): Promise<{ blocked: boolean }> {
  if (creatorId === readerId) {
    throw new Error("Vous ne pouvez pas vous bloquer vous-même.");
  }

  const existing = await prisma.blockedUser.findUnique({
    where: {
      creatorId_readerId: { creatorId, readerId },
    },
  });

  if (existing) {
    await prisma.blockedUser.delete({ where: { id: existing.id } });
    return { blocked: false };
  } else {
    await prisma.blockedUser.create({
      data: { creatorId, readerId },
    });
    return { blocked: true };
  }
}

/**
  * 🙈 Mute ou démute un mot-clé (Bluesky Muted Words).
  */
export async function toggleMuteWord(userId: string, rawWord: string): Promise<{ muted: boolean; word: string }> {
  const word = rawWord.toLowerCase().trim();
  if (!word) throw new Error("Mot-clé invalide.");

  const existing = await prisma.mutedWord.findUnique({
    where: {
      userId_word: { userId, word },
    },
  });

  if (existing) {
    await prisma.mutedWord.delete({ where: { id: existing.id } });
    return { muted: false, word };
  } else {
    await prisma.mutedWord.create({
      data: { userId, word },
    });
    return { muted: true, word };
  }
}

