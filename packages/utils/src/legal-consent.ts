// =====================================================================
// ⚖️ legal-consent — consentement légal recueilli au formulaire
// =====================================================================
// Module PUR (aucun accès réseau ni navigateur) partagé par le formulaire
// d'inscription (`@qoe/ui`) et la couche d'accès API (`@qoe/sdk`).
//
// Le formulaire ne peut pas prouver un consentement : il n'y a pas encore de
// compte au moment du clic. Il dépose donc son choix dans les métadonnées du
// compte Supabase (`user_metadata.signupConsent`), et c'est le serveur Go qui
// transforme ce choix en preuve au moment exact où la ligne User est créée.
//
// Chaque entrée porte la version RÉELLEMENT affichée : si le texte change entre
// l'inscription et l'activation du compte, le serveur refuse d'enregistrer une
// preuve sur une version que la personne n'a pas lue.
// =====================================================================

/** Document affiché dans le formulaire d'inscription. */
export interface ConsentDocument {
  slug: string;
  title: string;
  version: string;
  versionId: string;
}

/** Signature déposée dans `user_metadata.signupConsent`. */
export interface SignupConsentPayload {
  locale: string;
  at: string;
  items: Array<{ slug: string; versionId: string; version: string }>;
}

/**
 * Construit la charge utile d'inscription. Retourne `undefined` quand aucun
 * document n'exige d'acceptation : on n'écrit alors rien dans les métadonnées
 * plutôt que de laisser un objet vide traîner dans le JWT.
 */
export function buildSignupConsent(
  locale: string,
  documents: ConsentDocument[],
  now: Date = new Date()
): SignupConsentPayload | undefined {
  if (documents.length === 0) return undefined;
  return {
    locale,
    at: now.toISOString(),
    items: documents.map((doc) => ({
      slug: doc.slug,
      versionId: doc.versionId,
      version: doc.version,
    })),
  };
}
