// =====================================================================
// 📨 Embed newsletter qoe.fi — logique pure du formulaire intégrable (fiche 02)
// =====================================================================
// Ce module ne touche JAMAIS au DOM ni au réseau : toute entrée invalide
// retourne une erreur explicite, jamais d'exception. La couche navigateur
// (browser.ts) ne fait qu'appeler ces fonctions. Testable sans navigateur.
//
// Deux parcours (fiche 02) :
//   1. e-mail sans compte → POST public, réponse neutre, confirmation par lien.
//      Le front externe ne peut pas imposer `active` : c'est le backend qui
//      décide, toujours.
//   2. « S'abonner avec qoe.fi » → popup (repli redirection) vers une page
//      qoe.fi qui lit SA propre session ; le site tiers ne reçoit qu'un
//      résultat minimal (abonné / annulé), jamais session, token ni email.
// =====================================================================

// Longueur maximale d'une adresse (RFC 5321) : au-delà, refus local immédiat.
const MAX_EMAIL_LENGTH = 254;

// Tailles bornées pour ne jamais construire d'URL explosive.
const MAX_SLUG_LENGTH = 160;
const MAX_URL_LENGTH = 2048;

// Expression stricte suffisante côté client (le backend revalide) : un seul
// @, un point dans le domaine, pas d'espaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmbedSubscribeInput {
  /** Racine de l'API, ex. https://api.qoe.fi (sans slash final de préférence). */
  apiBase: string;
  /** Slug ou identifiant PUBLIC de la publication (ni secret ni preuve). */
  publication: string;
  /** Adresse saisie par le visiteur. */
  email: string;
  /** Locale explicite du visiteur (fr/en), sinon le backend déduit. */
  locale?: string;
}

export interface EmbedRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

function cleanBase(base: string): string | null {
  const trimmed = base.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+$/i.test(trimmed) || trimmed.length > MAX_URL_LENGTH) {
    return null;
  }
  return trimmed;
}

function cleanPublication(publication: string): string | null {
  const trimmed = publication.trim();
  if (!trimmed || trimmed.length > MAX_SLUG_LENGTH || /[\s<>"]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function cleanEmail(email: string): string | null {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned || cleaned.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/** Erreur de validation locale (avant tout appel réseau). */
export class EmbedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbedValidationError';
  }
}

/**
 * Construit la requête d'inscription par e-mail (parcours 1). Le backend
 * répond de façon neutre et crée au plus une demande en attente : confirmer
 * A n'active jamais B, et rien n'est actif sans clic (fiche 01).
 */
export function buildSubscribeRequest(input: EmbedSubscribeInput): EmbedRequest {
  const apiBase = cleanBase(input.apiBase);
  if (!apiBase) throw new EmbedValidationError('apiBase invalide (http(s)://hôte attendu).');
  const publication = cleanPublication(input.publication);
  if (!publication) throw new EmbedValidationError('Identifiant de publication invalide.');
  const email = cleanEmail(input.email);
  if (!email) throw new EmbedValidationError('Adresse e-mail invalide.');
  const locale = input.locale === 'en' || input.locale === 'fr' ? input.locale : undefined;
  return {
    url: `${apiBase}/v1/publications/${encodeURIComponent(publication)}/subscribe${
      locale ? `?locale=${locale}` : ''
    }`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  };
}

export interface QoeSubscribePopupInput {
  /** Racine de l'app qoe.fi, ex. https://qoe.fi (sans slash final). */
  appBase: string;
  /** Slug ou identifiant PUBLIC de la publication. */
  publication: string;
  /** URL de retour vers le site tiers (optionnelle, validée : http(s) uniquement). */
  returnUrl?: string;
}

/**
 * Construit l'URL de la page d'abonnement qoe.fi (parcours 2). La page lit SA
 * propre session ; le site tiers ne lit jamais les cookies qoe.fi.
 */
export function buildSubscribePopupUrl(input: QoeSubscribePopupInput): string {
  const appBase = cleanBase(input.appBase);
  if (!appBase) throw new EmbedValidationError('appBase invalide (http(s)://hôte attendu).');
  const publication = cleanPublication(input.publication);
  if (!publication) throw new EmbedValidationError('Identifiant de publication invalide.');
  const params = new URLSearchParams({ publication });
  if (input.returnUrl !== undefined) {
    const cleaned = cleanReturnUrl(input.returnUrl);
    if (!cleaned) throw new EmbedValidationError('URL de retour invalide (http(s) uniquement).');
    params.set('return', cleaned);
  }
  return `${appBase}/subscribe-with-qoefi?${params.toString()}`;
}

/**
 * Valide une URL de retour : http(s) uniquement, longueur bornée, pas de
 * javascript:/data:. Retourne null si invalide — l'appelant n'ouvre alors
 * rien (pas de redirection libre vers une URL arbitraire, fiche 02 §7).
 */
export function cleanReturnUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.toString();
}

/**
 * Vérifie l'origine d'un message reçu de la popup : elle doit être exactement
 * l'origine de `appBase`. Toute autre origine est ignorée — deux fenêtres ne
 * communiquent que si l'origine est prouvée (fiche 02 §3).
 */
export function isTrustedPopupOrigin(eventOrigin: string, appBase: string): boolean {
  let app: URL;
  let origin: URL;
  try {
    app = new URL(appBase);
    origin = new URL(eventOrigin);
  } catch {
    return false;
  }
  return app.origin === origin.origin;
}

/** Résultat minimal transmis par la popup : succès ou annulation, rien d'autre. */
export type QoeSubscribeResult = { ok: true } | { cancelled: true };

/**
 * Interprète les données brutes d'un message popup : seules les formes
 * `{ ok: true }` et `{ cancelled: true }` sont acceptées. Tout le reste
 * (session, token, email, objets complexes) est rejeté — le site tiers
 * n'obtient jamais plus que le résultat minimal.
 */
export function parsePopupResult(data: unknown): QoeSubscribeResult | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.ok === true && Object.keys(record).length === 1) return { ok: true };
  if (record.cancelled === true && Object.keys(record).length === 1) return { cancelled: true };
  return null;
}

// Logo officiel qoe.fi (glyphe « Q », variante claire) pour le bouton
// « S'abonner avec qoe.fi » (fiche 02 §2 : choix clairement identifié).
// Servi par qoe.fi lui-même (`/brand/q-symbol.svg`, copie conforme de
// `packages/brand/assets/logos/qoefie_svg.svg`) : le site tiers affiche
// toujours le logo officiel à jour, sans copie divergente embarquée.
// Le bouton généré prévoit un repli texte si l'image ne charge pas.
export function qoeLogoUrl(appBase: string): string {
  const base = cleanBase(appBase);
  if (!base) throw new EmbedValidationError('appBase invalide (http(s)://hôte attendu).');
  return `${base}/brand/q-symbol.svg`;
}

/** Bouton HTML « S'abonner avec qoe.fi » prêt à coller (fiche 02 §2). */
export function qoeSubscribeButtonHtml(appBase: string): string {
  const logo = qoeLogoUrl(appBase).replace(/"/g, '%22');
  return (
    `<span style="display:inline-flex;align-items:center;gap:8px;` +
    `font:600 14px/1 system-ui,sans-serif;">` +
    `<img src="${logo}" alt="qoe.fi" width="22" height="14" ` +
    `onerror="this.style.display='none'" />` +
    `<span>S'abonner avec qoe.fi</span></span>`
  );
}
