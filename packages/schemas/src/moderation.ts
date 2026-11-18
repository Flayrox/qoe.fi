// =====================================================================
// 🚨 moderation.ts — Schémas de modération et signalements
// =====================================================================

import { z } from 'zod';
import { idSchema, multiLineText } from './common';

/**
 * 🚨 Schéma de création d'un signalement de modération.
 */
export const createReportSchema = z.object({
  // L'identifiant part dans une requête SQL : charset borné, 64 caractères max.
  targetId: idSchema,
  targetType: z.enum(['thought', 'article', 'user', 'comment']).default('thought'),
  reason: z.enum(['spam', 'harassment', 'hate_speech', 'misleading', 'other']).default('spam'),
  details: multiLineText('Les détails', 500)
    .nullable()
    .optional()
    // Une chaîne vide n'est pas un détail : on la ramène à `undefined`.
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
