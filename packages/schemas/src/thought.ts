// =====================================================================
// 💭 thought.ts — Schémas de pensées, réponses et contenus sociaux
// =====================================================================

import { z } from 'zod';

/**
 * 📝 Texte de pensée ou contenu de post.
 */
export const postContentSchema = z
  .string()
  .trim()
  .min(1, 'Le post ne peut pas être vide')
  .max(10_000, '10 000 caractères maximum');

/**
 * ✍️ Schéma de création d'une pensée (Thought).
 */
export const createThoughtSchema = z
  .object({
    content: z.string().trim().max(10_000, '10 000 caractères maximum'),
    tags: z
      .array(z.string().trim().min(1).max(40, '40 caractères maximum par tag'))
      .max(10, '10 tags maximum')
      .default([]),
    imageUrl: z.string().trim().max(2000, '2000 caractères maximum').nullable().optional(),
    visibility: z.enum(['public', 'followers', 'subscribers', 'private']).default('public'),
    isDraft: z.boolean().default(false),
    scheduledAt: z.string().nullable().optional(),
    triggerWarning: z.string().trim().max(120, '120 caractères maximum').nullable().optional(),
    repostId: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      const hasContent = data.content.length > 0;
      const hasImage = Boolean(
        data.imageUrl && data.imageUrl.trim() && data.imageUrl !== '[]' && data.imageUrl !== 'null'
      );
      const hasRepost = Boolean(data.repostId);
      const hasParent = Boolean(data.parentId);
      return hasContent || hasImage || hasRepost || hasParent;
    },
    {
      message: 'Le contenu, une image ou une citation est requis pour publier une pensée.',
      path: ['content'],
    }
  );

export type CreateThoughtInput = z.infer<typeof createThoughtSchema>;

/**
 * 💬 Schéma de réponse à un post existant.
 */
export const replyToPostSchema = z.object({
  postId: z.string().trim().min(1, 'ID du post requis'),
  content: z
    .string()
    .trim()
    .min(1, 'Le contenu de la réponse ne peut pas être vide.')
    .max(10_000, '10 000 caractères maximum'),
});

export type ReplyToPostInput = z.infer<typeof replyToPostSchema>;
