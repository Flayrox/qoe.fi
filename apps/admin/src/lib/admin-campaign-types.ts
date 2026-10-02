// =====================================================================
// 📣 admin-campaign-types — types et constantes des campagnes staff
// =====================================================================
// Découplé des fetchers serveur (goFetch) pour être importable en toute
// sécurité dans les Client Components sans embarquer next/headers.
// =====================================================================

export interface StaffCampaign {
  id: string;
  type: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface StaffCampaignInput {
  type: string;
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
  { value: 'LEGAL_NOTICE', label: 'Notification légale' },
  { value: 'STAFF_DIRECT', label: 'Message de l’équipe' },
  { value: 'PRODUCT_NEWS', label: 'Nouveauté produit' },
] as const;

/** Audiences fermées (publication = média nommé, sinon tout le monde). */
export const CAMPAIGN_AUDIENCES = [
  { value: 'ALL_USERS', label: 'Tous les comptes' },
  { value: 'PUBLICATION_SUBSCRIBERS', label: 'Abonnés d’une publication' },
] as const;

/** Transitions de cycle de vie, dans l'ordre du serveur. */
export const CAMPAIGN_TRANSITIONS = [
  { action: 'submit', label: 'Soumettre', from: 'DRAFT' },
  { action: 'approve', label: 'Approuver', from: 'SUBMITTED' },
  { action: 'start', label: 'Lancer', from: 'APPROVED' },
  { action: 'pause', label: 'Suspendre', from: 'SENDING' },
  { action: 'cancel', label: 'Annuler', from: 'DRAFT,SUBMITTED,APPROVED,SENDING,PAUSED' },
] as const;
