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

export type FeatureStatus = 'in-development' | 'pro' | 'coming-soon' | 'paused';

export type FeatureLocale = 'fr' | 'en';

/** Paire FR/EN obligatoire : aucune copie partielle ne compile. */
export type LocalizedText = Record<FeatureLocale, string>;

/** Palier nécessaire pour utiliser la fonctionnalité une fois livrée. */
export type FeaturePlan = 'free' | 'pro';

/** Surface concernée : le studio (créateur) ou le site public (lecteur). */
export type FeatureAudience = 'creator' | 'reader';

/** Action principale de l'interstitiel. `none` = aucune promesse d'action. */
export type FeatureCta = 'notify' | 'upgrade' | 'none';

export interface FeatureDefinition {
  /** Clé stable, persistée dans les signaux d'intérêt. */
  readonly key: string;
  readonly status: FeatureStatus;
  readonly plan: FeaturePlan;
  readonly audience: FeatureAudience;
  /** Action principale : être prévenu, découvrir Pro, ou aucune (suspendu). */
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
  'article-import': {
    key: 'article-import',
    status: 'paused',
    plan: 'free',
    audience: 'creator',
    cta: 'none',
    icon: 'clock',
    copy: {
      label: { fr: 'Suspendu', en: 'Paused' },
      title: { fr: 'Import d’articles', en: 'Article import' },
      summary: {
        fr: 'L’import RSS/Atom est temporairement coupé : la première version pouvait créer des brouillons visibles et n’avait aucune limite de volume.',
        en: 'RSS/Atom import is temporarily disabled: the first version could create publicly visible drafts and had no volume limit.',
      },
      details: [
        {
          fr: 'Le formulaire d’import est fermé ; les autres outils d’écriture restent disponibles.',
          en: 'The import form is closed; the other writing tools remain available.',
        },
        {
          fr: 'La refonte ajoutera un plafond, un aperçu avant import et un rapport d’erreurs par article.',
          en: 'The rebuild will add a cap, a preview before import and a per-article error report.',
        },
        {
          fr: 'Les articles importés resteront des brouillons privés jusqu’à votre validation explicite.',
          en: 'Imported articles will stay private drafts until you explicitly approve them.',
        },
      ],
      availability: {
        fr: 'Suspendu — reprise prévue après sécurisation et refonte du parseur.',
        en: 'Paused — planned to resume after security hardening and parser rebuild.',
      },
      ctaLabel: { fr: 'Fermer', en: 'Close' },
    },
  },
  'audio-tts': {
    key: 'audio-tts',
    status: 'coming-soon',
    plan: 'free',
    audience: 'reader',
    cta: 'notify',
    icon: 'sparkles',
    copy: {
      label: { fr: 'Bientôt', en: 'Soon' },
      title: { fr: 'Écoute audio & synthèse vocale', en: 'Audio listening & speech synthesis' },
      summary: {
        fr: 'Écoutez les articles lus à voix haute avec un rendu vocal naturel et fluide.',
        en: 'Listen to articles read aloud with natural, fluid voice narration.',
      },
      details: [
        {
          fr: 'Voix neuronales expressives adaptées aux longs formats et pauses de lecture.',
          en: 'Expressive neural voices crafted for long-form reading and natural pauses.',
        },
        {
          fr: 'Vitesse de lecture ajustable et reprise automatique là où vous vous êtes arrêté.',
          en: 'Adjustable playback speed and automatic resume where you left off.',
        },
        {
          fr: 'Accessible en tâche de fond pour poursuivre l’écoute pendant vos trajets.',
          en: 'Background playback support so you can keep listening on the move.',
        },
      ],
      availability: {
        fr: 'Prochainement disponible pour tous les lecteurs.',
        en: 'Coming soon for all readers.',
      },
      ctaLabel: { fr: 'Me prévenir', en: 'Notify me' },
      ctaHint: {
        fr: 'Un seul email dès l’ouverture de l’écoute audio.',
        en: 'A single email when audio listening launches.',
      },
    },
  },
  'ai-summary': {
    key: 'ai-summary',
    status: 'coming-soon',
    plan: 'free',
    audience: 'reader',
    cta: 'notify',
    icon: 'sparkles',
    copy: {
      label: { fr: 'Bientôt', en: 'Soon' },
      title: { fr: 'Résumé IA de l’article', en: 'AI Article Summary' },
      summary: {
        fr: 'Obtenez les idées clés et les points essentiels d’un écrit en quelques secondes.',
        en: 'Get key insights and essential takeaways in just a few seconds.',
      },
      details: [
        {
          fr: 'Synthèse structurée fidèle au texte d’origine, sans perte de nuance.',
          en: 'Structured summary faithful to the original text, preserving nuance.',
        },
        {
          fr: 'Temps de lecture estimé et repères rapides pour décider d’approfondir.',
          en: 'Estimated reading time and quick highlights to help you dive deeper.',
        },
        {
          fr: 'Génération instantanée respectueuse des droits des auteurs.',
          en: 'Instant generation respecting author rights and content integrity.',
        },
      ],
      availability: {
        fr: 'Bientôt disponible — tests d’exactitude en cours.',
        en: 'Coming soon — accuracy benchmarks underway.',
      },
      ctaLabel: { fr: 'Me prévenir', en: 'Notify me' },
      ctaHint: {
        fr: 'Notification à l’arrivée de la fonctionnalité.',
        en: 'Notification once the feature is available.',
      },
    },
  },
  'reading-papers': {
    key: 'reading-papers',
    status: 'coming-soon',
    plan: 'free',
    audience: 'reader',
    cta: 'notify',
    icon: 'globe',
    copy: {
      label: { fr: 'Bientôt', en: 'Soon' },
      title: {
        fr: 'Papiers de lecture Nuit chaude & Papier',
        en: 'Reading Papers Warm Night & Paper',
      },
      summary: {
        fr: 'Des rendus visuels immersifs inspirés du papier pour reposer vos yeux.',
        en: 'Immersive paper-like visual layouts designed to ease eye strain.',
      },
      details: [
        {
          fr: 'Nuanciers feutrés et contrastes adoucis pour les sessions de lecture nocturne.',
          en: 'Muted color palettes and softened contrasts for night reading sessions.',
        },
        {
          fr: 'Typographie éditoriale calibrée pour une lisibilité maximale.',
          en: 'Editorial typography calibrated for optimal readability.',
        },
        {
          fr: 'Basculez instantanément selon la luminosité ambiante de votre espace.',
          en: 'Instantly toggle modes depending on your ambient environment.',
        },
      ],
      availability: {
        fr: 'En cours de finition typographique.',
        en: 'Undergoing final typographical polish.',
      },
      ctaLabel: { fr: 'Me prévenir', en: 'Notify me' },
      ctaHint: {
        fr: 'Soyez averti dès le lancement des papiers de lecture.',
        en: 'Get notified when reading papers go live.',
      },
    },
  },
  'offline-reading': {
    key: 'offline-reading',
    status: 'coming-soon',
    plan: 'free',
    audience: 'reader',
    cta: 'notify',
    icon: 'clock',
    copy: {
      label: { fr: 'Bientôt', en: 'Soon' },
      title: { fr: 'Emport hors-ligne', en: 'Offline Reading' },
      summary: {
        fr: 'Téléchargez vos lectures pour les consulter sans connexion, partout.',
        en: 'Download your reading list to enjoy offline, anywhere.',
      },
      details: [
        {
          fr: 'Synchronisation automatique de votre bibliothèque et de vos signets.',
          en: 'Automatic sync of your saved library and bookmarks.',
        },
        {
          fr: 'Conserve les images et la mise en page originale hors réseau.',
          en: 'Preserves images and original formatting while offline.',
        },
        {
          fr: 'Reprise transparente de votre position de lecture à la reconnexion.',
          en: 'Seamless reading position restore upon reconnecting.',
        },
      ],
      availability: {
        fr: 'Déploiement prévu avec la prochaine version de l’application.',
        en: 'Planned release with the upcoming app update.',
      },
      ctaLabel: { fr: 'Me prévenir', en: 'Notify me' },
      ctaHint: {
        fr: 'Un email pour vous informer de l’ouverture du mode hors-ligne.',
        en: 'An email alerting you when offline mode is ready.',
      },
    },
  },
  'direct-messages': {
    key: 'direct-messages',
    status: 'coming-soon',
    plan: 'free',
    audience: 'reader',
    cta: 'notify',
    icon: 'mail',
    copy: {
      label: { fr: 'Bientôt', en: 'Soon' },
      title: { fr: 'Messagerie privée', en: 'Direct Messages' },
      summary: {
        fr: 'Échangez en direct et en toute confidentialité avec vos auteurs et vos proches.',
        en: 'Chat directly and confidentially with creators and friends.',
      },
      details: [
        {
          fr: 'Conversations directes protégées avec filtres anti-spam stricts.',
          en: 'Protected direct conversations with strict anti-spam filters.',
        },
        {
          fr: 'Partagez des extraits d’articles et des pensées en un clic.',
          en: 'Share article quotes and thoughts in a single tap.',
        },
        {
          fr: 'Contrôlez qui peut vous contacter via vos paramètres de confidentialité.',
          en: 'Control who can message you through your privacy settings.',
        },
      ],
      availability: {
        fr: 'Ouverture progressive aux membres de la communauté.',
        en: 'Gradual rollout to community members.',
      },
      ctaLabel: { fr: 'Me prévenir', en: 'Notify me' },
      ctaHint: {
        fr: 'Prévenez-moi lorsque la messagerie privée sera accessible.',
        en: 'Notify me when direct messages become available.',
      },
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
  paused: {
    label: { fr: 'Suspendu', en: 'Paused' },
    title: { fr: 'Fonctionnalité suspendue', en: 'Feature paused' },
    description: {
      fr: 'Cette fonctionnalité est retirée temporairement. Elle ne peut pas être utilisée tant que la refonte n’est pas livrée.',
      en: 'This feature has been temporarily removed. It cannot be used until the rebuild ships.',
    },
  },
};
