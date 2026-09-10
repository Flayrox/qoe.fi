// =====================================================================
// 🌐 common.ts — Schémas primitifs et formats réutilisables
// =====================================================================

import { z } from 'zod';

/**
 * 📧 Validation d'adresse email conforme et normalisée.
 */
export const emailSchema = z.string().trim().toLowerCase().email('Email invalide');

/**
 * 🔗 Slug URL-friendly (lettres minuscules, chiffres, tirets).
 */
export const slugSchema = z
  .string()
  .min(1, 'Le slug ne peut pas être vide')
  .max(100, 'Le slug ne peut pas dépasser 100 caractères')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide (lettres minuscules, chiffres, tirets)');

/**
 * 🆔 UUID v4 standard.
 */
export const uuidSchema = z.string().uuid('UUID invalide');

/**
 * 👤 Nom d'utilisateur (3-30 caractères, alphanum + tirets + underscores).
 */
export const usernameSchema = z
  .string()
  .min(3, '3 caractères minimum')
  .max(30, '30 caractères maximum')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Lettres, chiffres, tirets et underscores uniquement');

/**
 * 💰 Montant en centimes d'euro (entier positif, max 1 000 000 €).
 */
export const centsSchema = z
  .number()
  .int('Le montant en centimes doit être un entier')
  .nonnegative('Le montant ne peut pas être négatif')
  .max(1_000_000_00, 'Maximum 1 000 000 €');
