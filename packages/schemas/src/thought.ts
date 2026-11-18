// =====================================================================
// 💭 thought.ts — Schémas de pensées, réponses et contenus sociaux
// =====================================================================

import { z } from 'zod';
import { hasForbiddenMultiLineChars, idSchema, multiLineText, singleLineText } from './common';

const MAX_CONTENT_LENGTH = 10_000;
const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 10;
const MAX_IMAGES_PER_POST = 8;
const MAX_IMAGE_PAYLOAD_LENGTH = 2000;

/**
 * 🔒 Une URL d'image est rendue telle quelle dans `<img src>` : seuls
 * `http(s)` et les chemins racine du site sont acceptés. `javascript:`,
 * `data:`, `blob:`, `//evil.com`, `/\evil.com` et tout espace/antislash
 * (que les navigateurs réinterprètent) sont refusés.
 */
function isSafeMediaUrl(raw: string): boolean {
  if (raw.length === 0 || raw.length > MAX_IMAGE_PAYLOAD_LENGTH) return false;
  if (/[\s\\]/.test(raw)) return false;
  if (raw.startsWith('/')) return !raw.startsWith('//');
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * 🖼️ `imageUrl` porte soit une URL unique (héritage), soit le tableau JSON
 * produit par le compositeur (`["https://…","https://…"]`). Les deux formes
 * sont validées : c'est cette valeur qui finit dans le HTML mobile et web.
 */
function isImagePayload(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0 || value === '[]' || value === 'null') return true;
  if (!value.startsWith('[')) return isSafeMediaUrl(value);

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_IMAGES_PER_POST) {
    return false;
  }
  return parsed.every((entry) => typeof entry === 'string' && isSafeMediaUrl(entry));
}

const imagePayloadSchema = z
  .string()
  .trim()
  .max(MAX_IMAGE_PAYLOAD_LENGTH, `${MAX_IMAGE_PAYLOAD_LENGTH} caractères maximum`)
  .refine(isImagePayload, "L'image doit être une URL http(s) ou un tableau JSON d'URLs http(s).")
  .nullable()
  .optional();

/**
 * 🏷️ Un tag : `#` initial toléré (le compositeur les extrait du texte),
 * lettres/chiffres/tirets/underscores uniquement, 40 caractères maximum.
 */
const tagSchema = z
  .string()
  .trim()
  .min(1, 'Un tag ne peut pas être vide')
  .max(MAX_TAG_LENGTH, `${MAX_TAG_LENGTH} caractères maximum par tag`)
  .regex(/^#?[\p{L}\p{N}_-]+$/u, 'Tag invalide (lettres, chiffres, tirets, underscores)');

/** Dédoublonne les tags sans tenir compte de la casse, en gardant le premier. */
function dedupeTags(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * 🗓️ Date de publication programmée : RFC 3339 avec fuseau, exactement ce que
 * `time.Parse(time.RFC3339)` accepte côté Go. Sans fuseau, Go renvoie une 400
 * après un aller-retour réseau inutile.
 */
const scheduledAtSchema = z
  .string()
  .trim()
  .datetime({ offset: true, message: 'Date programmée invalide (ISO 8601 avec fuseau attendu).' })
  .nullable()
  .optional();

/**
 * 📝 Texte de pensée ou contenu de post.
 */
export const postContentSchema = multiLineText('Le post', MAX_CONTENT_LENGTH, 1);

/**
 * ✍️ Schéma de création d'une pensée (Thought).
 */
export const createThoughtSchema = z
  .object({
    // `default('')` : une pensée média, une citation ou une réponse n'a pas
    // besoin d'un champ `content` côté client pour être valide.
    content: multiLineText('Le contenu', MAX_CONTENT_LENGTH).default(''),
    tags: z
      .array(tagSchema)
      .max(MAX_TAGS, `${MAX_TAGS} tags maximum`)
      .default([])
      .transform(dedupeTags),
    imageUrl: imagePayloadSchema,
    visibility: z.enum(['public', 'followers', 'subscribers', 'private']).default('public'),
    isDraft: z.boolean().default(false),
    scheduledAt: scheduledAtSchema,
    triggerWarning: singleLineText('Le trigger warning', 120).nullable().optional(),
    repostId: idSchema.nullable().optional(),
    parentId: idSchema.nullable().optional(),
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
  )
  .refine((data) => !hasForbiddenMultiLineChars(data.content), {
    message: 'Le contenu contient des caractères de contrôle interdits.',
    path: ['content'],
  });

export type CreateThoughtInput = z.infer<typeof createThoughtSchema>;

/**
 * 💬 Schéma de réponse à un post existant.
 */
export const replyToPostSchema = z.object({
  postId: idSchema,
  content: multiLineText('Le contenu de la réponse', MAX_CONTENT_LENGTH, 1),
});

export type ReplyToPostInput = z.infer<typeof replyToPostSchema>;
