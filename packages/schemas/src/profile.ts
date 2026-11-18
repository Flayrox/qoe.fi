// =====================================================================
// 👤 profile.ts — Schémas de profil utilisateur et identité
// =====================================================================

import { z } from 'zod';
import { multiLineText, singleLineText, usernameSchema } from './common';

const MAX_URL_LENGTH = 2000;

/**
 * 🔗 URL d'image de profil : `http(s)` uniquement, sans espace ni antislash
 * (les navigateurs les réinterprètent), et **sans identifiants embarqués**
 * (`https://user:pass@host` fuiterait un secret dans le HTML public).
 */
function httpUrlSchema(label: string) {
  return z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, "L'URL ne peut pas dépasser 2000 caractères.")
    .url(`URL ${label} invalide.`)
    .refine((value) => !/[\s\\]/.test(value), 'URL invalide (espace ou antislash interdit).')
    .refine((value) => {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        return !parsed.username && !parsed.password;
      } catch {
        return false;
      }
    }, 'Seules les URLs http:// ou https:// sans identifiants sont autorisées.');
}

/**
 * 👤 Schéma de mise à jour du profil utilisateur.
 */
export const updateProfileSchema = z.object({
  name: singleLineText('Le nom', 120, 2),
  // Même schéma que partout ailleurs : une seule règle, alignée sur Go.
  username: usernameSchema,
  heroText: multiLineText('La bio', 1000).nullable().optional(),
  logoUrl: httpUrlSchema('du logo').nullable().optional(),
  headerImageUrl: httpUrlSchema("d'en-tête").nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
