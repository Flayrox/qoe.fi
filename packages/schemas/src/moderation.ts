// =====================================================================
// 🚨 moderation.ts — Schémas de modération et signalements
// =====================================================================

import { z } from 'zod';

/**
 * 🚨 Schéma de création d'un signalement de modération.
 */
export const createReportSchema = z.object({
  targetId: z.string().min(1, "L'ID de la cible est requis"),
  targetType: z.enum(['thought', 'article', 'user', 'comment']).default('thought'),
  reason: z.enum(['spam', 'harassment', 'hate_speech', 'misleading', 'other']).default('spam'),
  details: z
    .string()
    .trim()
    .max(500, 'Les détails ne peuvent pas dépasser 500 caractères.')
    .optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
