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
