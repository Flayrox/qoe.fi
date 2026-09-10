// =====================================================================
// 👤 profile.ts — Schémas de profil utilisateur et identité
// =====================================================================

import { z } from 'zod';

/**
 * 👤 Schéma de mise à jour du profil utilisateur.
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
