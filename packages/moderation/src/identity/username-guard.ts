// =====================================================================
// 🛡️ Username Guard — Sécurisation et Modération Stricte des Pseudos
// =====================================================================
// 1. Détection et blocage de l'usurpation (admin, qoe, support, official)
// 2. Détection du discours haineux, nazisme, suprémacisme et slurs
// 3. Décodage préventif des homoglyphes et du leetspeak
// =====================================================================

import { normalizeHomoglyphs, decodeLeetspeak } from './homoglyphs';

export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,30}$/;

// Noms d'utilisateurs réservés pour l'équipe / plateforme (anti-impersonation)
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'qoe',
  'qoefi',
  'official',
  'moderator',
  'mod',
  'staff',
  'security',
  'system',
  'sysadmin',
  'null',
  'undefined',
  'api',
  'auth',
  'billing',
  'help',
  'team',
  'legal',
  'press',
  'terms',
  'privacy',
  'contact',
]);

// Termes haineux, extrémistes et néo-nazis strictement prohibés
export const PROHIBITED_HATE_PATTERNS: RegExp[] = [
  /hitler/i,
  /nazi/i,
  /swastika/i,
  /gestapo/i,
  /goebbels/i,
  /himmler/i,
  /aryan/i,
  /whitepower/i,
  /ku_?klux_?klan/i,
  /kkk/i,
  /\b1488\b/,
  /holocaust/i,
  /auschwitz/i,
  /ss_officer/i,
  /waffen/i,
  /reich/i,
  /fuerher|fuhrer/i,
  /negro|nigger|nigga|bougnoul|chleuh|youpin|kike|faggot|pedophile/i,
];

export interface ValidateUsernameResult {
  valid: boolean;
  error?: string;
  reason?: 'format' | 'reserved' | 'prohibited';
}

/**
 * 🛡️ Valide un nom d'utilisateur (format, réservation, modération de sécurité).
 */
export function validateUsername(rawUsername: string): ValidateUsernameResult {
  if (!rawUsername || typeof rawUsername !== 'string') {
    return { valid: false, error: "Le nom d'utilisateur est requis.", reason: 'format' };
  }

  const trimmed = rawUsername.trim();

  // 1. Validation de longueur
  if (trimmed.length < 3 || trimmed.length > 30) {
    return {
      valid: false,
      error: "Le nom d'utilisateur doit contenir entre 3 et 30 caractères.",
      reason: 'format',
    };
  }

  // 2. Validation de format (caractères autorisés)
  if (!USERNAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      error:
        "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, tirets, points ou underscores.",
      reason: 'format',
    };
  }

  // 3. Ne doit pas commencer ou terminer par un symbole
  if (/^[._-]|[._-]$/.test(trimmed)) {
    return {
      valid: false,
      error:
        "Le nom d'utilisateur ne peut pas commencer ou se terminer par un point, tiret ou underscore.",
      reason: 'format',
    };
  }

  const lower = trimmed.toLowerCase();

  // 4. Vérification des noms réservés
  if (RESERVED_USERNAMES.has(lower)) {
    return {
      valid: false,
      error: "Ce nom d'utilisateur est réservé par la plateforme.",
      reason: 'reserved',
    };
  }

  // 5. Décodage homoglyphes + leetspeak pour la recherche de motifs interdits
  const normalized = normalizeHomoglyphs(lower);
  const leetDecoded = decodeLeetspeak(lower);
  const strippedDecoded = leetDecoded.replace(/[^a-z0-9]/g, '');

  for (const pattern of PROHIBITED_HATE_PATTERNS) {
    if (
      pattern.test(lower) ||
      pattern.test(normalized) ||
      pattern.test(leetDecoded) ||
      pattern.test(strippedDecoded)
    ) {
      return {
        valid: false,
        error: "Ce nom d'utilisateur ne respecte pas les règles de la communauté.",
        reason: 'prohibited',
      };
    }
  }

  return { valid: true };
}
