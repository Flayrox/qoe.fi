// =====================================================================
// 🛡️ Schémas de Validation Zod Partagés — Silicon Valley Standard
// =====================================================================

import { z } from 'zod';

/**
 * ✍️ Schéma de création d'une pensée (Thought).
 */
export const createThoughtSchema = z
  .object({
    content: z.string().trim(),
    tags: z.array(z.string()).default([]),
    imageUrl: z.string().nullable().optional(),
    visibility: z.enum(['public', 'followers', 'subscribers', 'private']).default('public'),
    isDraft: z.boolean().default(false),
    scheduledAt: z.string().nullable().optional(),
    triggerWarning: z.string().nullable().optional(),
    repostId: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      const hasContent = data.content.length > 0;
      const hasImage = !!(
        data.imageUrl &&
        data.imageUrl.trim() &&
        data.imageUrl !== '[]' &&
        data.imageUrl !== 'null'
      );
      const hasRepost = !!data.repostId;
      const hasParent = !!data.parentId;
      return hasContent || hasImage || hasRepost || hasParent;
    },
    {
      message: 'Le contenu, une image ou une citation est requis pour publier une pensée.',
      path: ['content'],
    }
  );

export type CreateThoughtInput = z.infer<typeof createThoughtSchema>;

/**
 * 💬 Schéma de réponse à un post.
 */
export const replyToPostSchema = z.object({
  postId: z.string().min(1, 'ID du post requis'),
  content: z.string().trim().min(1, 'Le contenu de la réponse ne peut pas être vide.'),
});

export type ReplyToPostInput = z.infer<typeof replyToPostSchema>;

/**
 * 👤 Schéma de mise à jour du profil.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit comporter au moins 2 caractères.'),
  username: z
    .string()
    .trim()
    .min(3, "Le nom d'utilisateur doit comporter au moins 3 caractères.")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores."
    ),
  heroText: z
    .string()
    .max(280, 'La bio ne peut pas dépasser 280 caractères.')
    .nullable()
    .optional(),
  logoUrl: z.string().url('URL de logo invalide.').nullable().optional(),
  headerImageUrl: z.string().url("URL d'en-tête invalide.").nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * 🚨 Schéma de signalement de modération.
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
