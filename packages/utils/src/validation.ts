// =====================================================================
// ✅ validation — Schémas Zod réutilisables
// =====================================================================

import { z } from "zod";

/**
 * 📧 Email valide.
 */
export const emailSchema = z
  .string()
  .email("Email invalide")
  .toLowerCase()
  .trim();

/**
 * 🔗 Slug URL-friendly.
 */
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide (lettres minuscules, chiffres, tirets)");

/**
 * 🆔 UUID.
 */
export const uuidSchema = z.string().uuid("UUID invalide");

/**
 * 👤 Username (3-30 chars, alphanum + tirets + underscores).
 */
export const usernameSchema = z
  .string()
  .min(3, "3 caractères minimum")
  .max(30, "30 caractères maximum")
  .regex(/^[a-zA-Z0-9_-]+$/, "Lettres, chiffres, tirets et underscores uniquement");

/**
 * 📝 Texte de post (1-10000 caractères).
 */
export const postContentSchema = z
  .string()
  .min(1, "Le post ne peut pas être vide")
  .max(10_000, "10 000 caractères maximum");

/**
 * 📰 Titre d'article (3-200 caractères).
 */
export const articleTitleSchema = z
  .string()
  .min(3, "3 caractères minimum")
  .max(200, "200 caractères maximum");

/**
 * 💰 Montant en centimes (entier positif).
 */
export const centsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(1_000_000_00, "Maximum 1 000 000 €");
