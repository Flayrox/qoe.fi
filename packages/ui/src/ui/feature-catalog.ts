// =====================================================================
// 🗂️ feature-catalog.ts — Source unique des fonctionnalités à venir / Pro
// =====================================================================
// 📖 Un seul registre typé décrit CHAQUE fonctionnalité indisponible :
//    statut, palier requis, public visé (créateur / lecteur) et copie FR+EN.
//
// 🎯 Objectif : plus aucune copie inventée sur place. Un composant ne
//    choisit qu'une CLÉ ; l'interstitiel, le badge et le tooltip lisent
//    le même enregistrement, donc ils ne peuvent pas diverguer.
//
// 🌍 Locales : FR + EN uniquement pour l'instant (décision produit).
//    Le type `LocalizedText` force la paire : impossible de livrer un
//    libellé traduit d'un seul côté (cf. feature-catalog.test.ts).
//
// ➕ Ajouter une fonctionnalité :
//    1. Ajoute une entrée ci-dessous (clé kebab-case stable, jamais renommée :
//       elle est persistée dans les signaux d'intérêt — cf. FeatureSignal).
//    2. Utilise-la : <UpcomingBadge feature="ma-cle" /> ou
//       useFeatureAnnouncement().open('ma-cle').
// =====================================================================

export type FeatureStatus = 'in-development' | 'pro' | 'coming-soon';

export type FeatureLocale = 'fr' | 'en';

/** Paire FR/EN obligatoire : aucune copie partielle ne compile. */
export type LocalizedText = Record<FeatureLocale, string>;

/** Palier nécessaire pour utiliser la fonctionnalité une fois livrée. */
export type FeaturePlan = 'free' | 'pro';

/** Surface concernée : le studio (créateur) ou le site public (lecteur). */
export type FeatureAudience = 'creator' | 'reader';

/** Action principale de l'interstitiel. */
export type FeatureCta = 'notify' | 'upgrade';

export interface FeatureDefinition {
  /** Clé stable, persistée dans les signaux d'intérêt. */
  readonly key: string;
  readonly status: FeatureStatus;
  readonly plan: FeaturePlan;
  readonly audience: FeatureAudience;
  /** Action principale : être prévenu, ou découvrir l'offre Pro. */
  readonly cta: FeatureCta;
  /** Icône lucide, résolue dans le composant (catalogue sans React). */
  readonly icon: 'globe' | 'mail' | 'lock' | 'clock' | 'sparkles';
  readonly copy: {
    /** Libellé court du badge (« Bientôt », « Pro »...). */
    readonly label: LocalizedText;
    /** Titre de l'interstitiel. */
    readonly title: LocalizedText;
    /** Une phrase, visible dans le badge au survol et l'en-tête. */
    readonly summary: LocalizedText;
    /** 2 à 3 points concrets : ce que ça fait, pour qui, à quel coût. */
    readonly details: readonly LocalizedText[];
    /** Fenêtre de disponibilité ou palier, en une ligne honnête. */
    readonly availability: LocalizedText;
    /** Libellé du bouton principal. */
    readonly ctaLabel: LocalizedText;
    /** Mention sous le bouton principal (rassurance). */
    readonly ctaHint?: LocalizedText;
  };
}

/**
 * 📋 Registre. Les clés sont un contrat public (télémétrie incluse) :
 * les renommer casserait l'historique des signaux.
 */
export const FEATURES = {
  'custom-domain': {
    key: 'custom-domain',
    status: 'coming-soon',
    plan: 'free',
    audience: 'creator',
    cta: 'notify',
    icon: 'globe',
    copy: {
      label: { fr: 'Bientôt', en: 'Soon' },
      title: { fr: 'Domaine personnalisé', en: 'Custom domain' },
      summary: {
        fr: 'Publiez sur votre propre nom de domaine, certificat TLS et redirections compris.',
        en: 'Publish on your own domain, with TLS certificates and redirects included.',
      },
      details: [
        {
          fr: 'Un enregistrement CNAME suffit : le certificat et son renouvellement sont gérés pour vous.',
          en: 'A single CNAME record is enough: the certificate and its renewal are handled for you.',
        },
        {
          fr: 'Redirections permanentes depuis votre ancien sous-domaine qoe.fi, sans perdre le référencement.',
          en: 'Permanent redirects from your old qoe.fi subdomain, without losing search rankings.',
        },
        {
          fr: 'Inclus dans votre espace : aucune option payante à ajouter.',
          en: 'Included in your workspace: no paid add-on to add.',
        },
      ],
      availability: {
        fr: 'Prochainement — nous finalisons la mise en service DNS.',
        en: 'Coming soon — we are finalizing DNS provisioning.',
      },
      ctaLabel: { fr: 'Me prévenir', en: 'Notify me' },
      ctaHint: {
        fr: 'Un seul email, le jour de la mise en service. Aucun autre envoi.',
        en: 'A single email, the day it ships. Nothing else.',
      },
    },
  },
  'email-customization': {
    key: 'email-customization',
    status: 'pro',
    plan: 'pro',
    audience: 'creator',
    cta: 'upgrade',
    icon: 'mail',
    copy: {
      label: { fr: 'Pro', en: 'Pro' },
      title: { fr: 'Personnalisation des emails', en: 'Email customization' },
      summary: {
        fr: 'Expéditeur, couleur des boutons, sujets et textes de vos emails transactionnels.',
        en: 'Sender, button color, subjects and copy for your transactional emails.',
      },
      details: [
        {
          fr: 'Nom d’expéditeur et adresse de réponse à votre marque.',
          en: 'Sender name and reply-to address matching your brand.',
        },
        {
          fr: 'Couleur des boutons, sujet et texte d’aperçu de chaque email.',
          en: 'Button color, subject and preview text for every email.',
        },
        {
          fr: 'Corps du message de bienvenue et note de pied de page.',
          en: 'Welcome message body and footer note.',
        },
      ],
      availability: {
        fr: 'Inclus avec Qoefi Pro. Les emails par défaut restent soignés en gratuit.',
        en: 'Included with Qoefi Pro. Default emails stay polished on the free plan.',
      },
      ctaLabel: { fr: 'Découvrir l’offre Pro', en: 'See the Pro plan' },
    },
  },
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof FEATURES;

/** Toutes les clés, dans l'ordre du registre (itération stable pour l'UI). */
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

/** Garde de type : une chaîne libre vient-elle bien du registre ? */
export function isFeatureKey(value: string): value is FeatureKey {
  return Object.prototype.hasOwnProperty.call(FEATURES, value);
}

/** Accès sûr (undefined hors registre, jamais de throw dans un rendu). */
export function getFeature(key: string): FeatureDefinition | undefined {
  return isFeatureKey(key) ? FEATURES[key] : undefined;
}

/**
 * Résout une copie localisée avec repli FR : une locale inconnue ne doit
 * jamais produire un libellé vide dans l'interface.
 */
export function localize(text: LocalizedText, locale: FeatureLocale = 'fr'): string {
  return text[locale] || text.fr;
}

export const DEFAULT_FEATURE_LOCALE: FeatureLocale = 'fr';

/** Libellés de statut partagés par le badge, le tooltip et l'interstitiel. */
export const FEATURE_STATUS_COPY: Record<
  FeatureStatus,
  { label: LocalizedText; title: LocalizedText; description: LocalizedText }
> = {
  'in-development': {
    label: { fr: 'En développement', en: 'In development' },
    title: { fr: 'Développement actif', en: 'Actively in development' },
    description: {
      fr: 'Cette fonctionnalité est en cours de développement. Elle arrivera dans une mise à jour, sans surcoût.',
      en: 'This feature is being built. It will arrive in an update, at no extra cost.',
    },
  },
  pro: {
    label: { fr: 'Pro', en: 'Pro' },
    title: { fr: 'Offre Qoefi Pro', en: 'Qoefi Pro plan' },
    description: {
      fr: 'Fonctionnalité réservée aux publications disposant de l’abonnement Qoefi Pro.',
      en: 'Reserved for publications on the Qoefi Pro subscription.',
    },
  },
  'coming-soon': {
    label: { fr: 'Bientôt', en: 'Soon' },
    title: { fr: 'Prochainement disponible', en: 'Coming soon' },
    description: {
      fr: 'L’intégration est finalisée. La fonctionnalité sera mise en service prochainement.',
      en: 'The integration is complete. The feature will be switched on shortly.',
    },
  },
};
