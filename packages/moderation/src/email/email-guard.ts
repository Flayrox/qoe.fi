// =====================================================================
// 🛡️ Email Guard — Protection anti-jetable et anti-multi-comptes
// =====================================================================
// 1. Détection des domaines d'adresses temporaires / jetables (O(1))
// 2. Normalisation anti-alias (+tag et points Gmail)
// 3. Calcul de l'email canonique (empreinte unique anti-sybil)
// =====================================================================

import { DISPOSABLE_EMAIL_DOMAINS } from './disposable-domains';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface NormalizedEmailResult {
  raw: string;
  normalized: string;
  canonical: string;
  domain: string;
  localPart: string;
  isDisposable: boolean;
}

/**
 * 🧹 Normalise une adresse email et calcule son empreinte canonique (anti-alias).
 * - Élimine les tags `+` (ex: user+test@gmail.com -> user@gmail.com)
 * - Élimine les points chez Google (ex: u.s.e.r@gmail.com -> user@gmail.com)
 * - Unifie googlemail.com -> gmail.com
 */
export function normalizeEmail(rawEmail: string): NormalizedEmailResult {
  const trimmed = (rawEmail || '').trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return {
      raw: rawEmail,
      normalized: trimmed,
      canonical: trimmed,
      domain: '',
      localPart: trimmed,
      isDisposable: false,
    };
  }

  const localPart = trimmed.slice(0, atIndex);
  let domain = trimmed.slice(atIndex + 1);

  // Normalisation du domaine
  if (domain === 'googlemail.com') {
    domain = 'gmail.com';
  }

  // Normalisation anti-alias pour le calcul canonique
  let canonicalLocalPart = localPart;

  // 1. Suppression du tag '+' pour les fournisseurs majeurs
  const plusIndex = canonicalLocalPart.indexOf('+');
  if (plusIndex !== -1) {
    canonicalLocalPart = canonicalLocalPart.slice(0, plusIndex);
  }

  // 2. Suppression des points '.' pour Gmail
  if (domain === 'gmail.com') {
    canonicalLocalPart = canonicalLocalPart.replace(/\./g, '');
  }

  const canonical = `${canonicalLocalPart}@${domain}`;
  const isDisposable = isDisposableEmail(domain);

  return {
    raw: rawEmail,
    normalized: `${localPart}@${domain}`,
    canonical,
    domain,
    localPart,
    isDisposable,
  };
}

/**
 * 🔍 Détecte si un domaine ou sous-domaine appartient à la liste des emails jetables.
 */
export function isDisposableEmail(emailOrDomain: string): boolean {
  if (!emailOrDomain) return false;

  let domain = emailOrDomain.toLowerCase().trim();
  const atIndex = domain.lastIndexOf('@');
  if (atIndex !== -1) {
    domain = domain.slice(atIndex + 1);
  }

  // Vérification exacte
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return true;
  }

  // Vérification des sous-domaines (ex: foo.yopmail.com -> yopmail.com)
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parentDomain = parts.slice(i).join('.');
    if (DISPOSABLE_EMAIL_DOMAINS.has(parentDomain)) {
      return true;
    }
  }

  return false;
}

export interface ValidateEmailResult {
  valid: boolean;
  error?: string;
  canonicalEmail?: string;
  normalizedEmail?: string;
}

/**
 * ✅ Valide une adresse email pour l'inscription.
 * Rejette la syntaxe invalide et les adresses jetables.
 */
export function validateRegistrationEmail(email: string): ValidateEmailResult {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Une adresse email est requise.' };
  }

  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) {
    return { valid: false, error: "La longueur de l'adresse email est invalide." };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: "Format d'adresse email invalide." };
  }

  const { isDisposable, canonical, normalized } = normalizeEmail(trimmed);

  if (isDisposable) {
    return {
      valid: false,
      error: 'Les adresses email temporaires ou jetables ne sont pas autorisées.',
    };
  }

  return {
    valid: true,
    canonicalEmail: canonical,
    normalizedEmail: normalized,
  };
}
