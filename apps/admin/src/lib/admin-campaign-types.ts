// =====================================================================
// 📣 admin-campaign-types — types et constantes des campagnes staff
// =====================================================================
// Découplé des fetchers serveur (goFetch) pour être importable en toute
// sécurité dans les Client Components sans embarquer next/headers.
//
// ⚠️ Les valeurs sont celles du serveur Go, pas des libellés d'interface :
// `feature.launch`, `all_active_users`, `pending_review`… Toute divergence
// faisait refuser une campagne valide par l'API.
// =====================================================================

export interface StaffCampaign {
  id: string;
  type: string;
  featureKey?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  subjectEn?: string;
  bodyHtmlEn?: string;
  bodyTextEn?: string;
  audienceType: string;
  audiencePublicationId?: string;
  audienceSnapshot?: string;
  status: string;
  draftedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  scheduledAt?: string;
  sentCount: number;
  failedCount: number;
  skippedCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffCampaignInput {
  type: string;
  featureKey?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  subjectEn?: string;
  bodyHtmlEn?: string;
  bodyTextEn?: string;
  audienceType: string;
  audiencePublicationId?: string;
  scheduledAt?: string;
}

/** Catégories fermées de campagne (vocabulaire du serveur). */
export const CAMPAIGN_TYPES = [
  { value: 'legal.version_notice', label: 'Notification légale' },
  { value: 'staff.direct', label: 'Message de l’équipe' },
  { value: 'product.announcement', label: 'Nouveauté produit' },
  { value: 'feature.launch', label: 'Lancement d’une fonctionnalité' },
] as const;

/** Audiences fermées (publication = média nommé, sinon tout le monde). */
export const CAMPAIGN_AUDIENCES = [
  { value: 'all_active_users', label: 'Tous les comptes actifs' },
  { value: 'publication_subscribers', label: 'Abonnés d’une publication' },
  { value: 'feature_interested', label: 'Personnes ayant demandé à être prévenues' },
] as const;

/** Transitions de cycle de vie, dans l'ordre du serveur. */
export const CAMPAIGN_TRANSITIONS = [
  { action: 'submit', label: 'Soumettre', from: 'draft' },
  { action: 'approve', label: 'Approuver', from: 'pending_review' },
  { action: 'start', label: 'Lancer', from: 'approved' },
  { action: 'pause', label: 'Suspendre', from: 'sending' },
  {
    action: 'cancel',
    label: 'Annuler',
    from: 'draft,pending_review,approved,sending,paused',
  },
] as const;
