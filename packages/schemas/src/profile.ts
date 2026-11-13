// =====================================================================
// 👤 profile.ts — Schémas de profil utilisateur et identité
// =====================================================================

import { z } from 'zod';

const httpUrlSchema = (invalidMessage: string) =>
  z
    .string()
    .trim()
    .max(2000, "L'URL ne peut pas dépasser 2000 caractères.")
    .url(invalidMessage)
    .refine(
      (val) => {
        try {
          const parsed = new URL(val);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'Seules les URLs http:// ou https:// sont autorisées.' }
    );

/**
 * 👤 Schéma de mise à jour du profil utilisateur.
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Le nom doit comporter au moins 2 caractères.')
    .max(120, 'Le nom ne peut pas dépasser 120 caractères.'),
  username: z
    .string()
    .trim()
    .min(3, "Le nom d'utilisateur doit comporter au moins 3 caractères.")
    .max(40, "Le nom d'utilisateur ne peut pas dépasser 40 caractères.")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores."
    ),
  heroText: z
    .string()
    .trim()
    .max(1000, 'La bio ne peut pas dépasser 1000 caractères.')
    .nullable()
    .optional(),
  logoUrl: httpUrlSchema('URL de logo invalide.').nullable().optional(),
  headerImageUrl: httpUrlSchema("URL d'en-tête invalide.").nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
