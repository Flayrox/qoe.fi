// =====================================================================
// 🌐 common.ts — Schémas primitifs et formats réutilisables
// =====================================================================

import { z } from 'zod';

/** Longueur maximale d'un slug (même borne que `@qoe/utils/slugify`). */
export const MAX_SLUG_LENGTH = 96;

/** Longueur maximale d'un identifiant opaque (UUID texte, slug court, cuid). */
export const MAX_ID_LENGTH = 64;

/** Longueur maximale d'une adresse e-mail (RFC 5321 §4.5.3.1.3). */
export const MAX_EMAIL_LENGTH = 254;

/** Nom d'utilisateur : bornes identiques à `identifier.ValidUsername` (Go). */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;

// Caractères qui cassent un journal, une ligne de CSV ou l'affichage d'un nom :
// C0 (hors \t et \n), DEL, retours de ligne Unicode et marques bidi (U+202E
// inverse le sens de lecture du texte qui suit).
const MULTILINE_FORBIDDEN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

/** Vrai si le texte contient un caractère interdit sur une seule ligne. */
export function hasForbiddenSingleLineChars(value: string): boolean {
  return SINGLE_LINE_FORBIDDEN.test(value);
}

/** Vrai si le texte contient un caractère interdit même en multi-lignes. */
export function hasForbiddenMultiLineChars(value: string): boolean {
  return MULTILINE_FORBIDDEN.test(value);
}

/**
 * 📝 Texte mono-ligne : trim, bornes de longueur, caractères de contrôle
 * refusés (un `\n` dans un titre permet de forger une entrée de journal).
 */
export function singleLineText(label: string, max: number, min = 0) {
  return z
    .string()
    .trim()
    .min(min, `${label} : ${min} caractère${min > 1 ? 's' : ''} minimum.`)
    .max(max, `${label} : ${max} caractères maximum.`)
    .refine(
      (value) => !SINGLE_LINE_FORBIDDEN.test(value),
      `${label} contient des caractères de contrôle interdits.`
    );
}

/**
 * 📝 Texte multi-lignes (post, bio, signalement) : `\n` et `\t` restent
 * autorisés, tout autre caractère de contrôle ou bidi est refusé.
 */
export function multiLineText(label: string, max: number, min = 0) {
  return z
    .string()
    .trim()
    .min(min, `${label} : ${min} caractère${min > 1 ? 's' : ''} minimum.`)
    .max(max, `${label} : ${max} caractères maximum.`)
    .refine(
      (value) => !MULTILINE_FORBIDDEN.test(value),
      `${label} contient des caractères de contrôle interdits.`
    );
}

/**
 * 📧 Validation d'adresse email conforme et normalisée.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH, `L'adresse e-mail ne peut pas dépasser ${MAX_EMAIL_LENGTH} caractères.`)
  .email('Email invalide');

/**
 * 🔗 Slug URL-friendly (lettres minuscules, chiffres, tirets).
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Le slug ne peut pas être vide')
  .max(MAX_SLUG_LENGTH, `Le slug ne peut pas dépasser ${MAX_SLUG_LENGTH} caractères`)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide (lettres minuscules, chiffres, tirets)');

/**
 * 🆔 UUID (forme canonique, casing normalisé).
 */
export const uuidSchema = z.string().trim().toLowerCase().uuid('UUID invalide');

/**
 * 🔑 Identifiant opaque transmis dans une URL ou une requête SQL.
 */
export const idSchema = z
  .string()
  .trim()
  .min(1, 'Identifiant requis')
  .max(MAX_ID_LENGTH, `L'identifiant ne peut pas dépasser ${MAX_ID_LENGTH} caractères`)
  .regex(/^[A-Za-z0-9_-]+$/, 'Identifiant invalide');

/**
 * 👤 Normalise un nom d'utilisateur comme le fait le serveur Go :
 * trim, minuscules, `@` initial retiré.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

/**
 * 👤 Nom d'utilisateur — **même règle que `identifier.ValidUsername` (Go)** :
 * 3 à 24 caractères, `[a-z0-9]` séparés par un seul `.` ou `_`.
 * Go reste la source de vérité : ce schéma ne fait que refuser plus tôt.
 */
export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .refine(
    (value) => value.length >= USERNAME_MIN_LENGTH && value.length <= USERNAME_MAX_LENGTH,
    `Le nom d'utilisateur doit comporter entre ${USERNAME_MIN_LENGTH} et ${USERNAME_MAX_LENGTH} caractères.`
  )
  .refine(
    (value) => /^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(value),
    "Le nom d'utilisateur ne peut contenir que des minuscules, des chiffres et un seul séparateur (`.` ou `_`) entre deux segments."
  );

/**
 * 💰 Montant en centimes d'euro (entier positif sûr, max 1 000 000 €).
 */
export const centsSchema = z
  .number()
  .int('Le montant en centimes doit être un entier')
  .safe('Le montant en centimes dépasse la précision entière sûre')
  .nonnegative('Le montant ne peut pas être négatif')
  .max(1_000_000_00, 'Maximum 1 000 000 €');
