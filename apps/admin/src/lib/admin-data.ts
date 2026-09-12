// =====================================================================
// 🛡️ admin-data — couche de données de la console superadmin
// =====================================================================
// Go en primaire : GET /v1/admin/dashboard, GET /v1/admin/users,
// GET /v1/admin/users/{id}, widgets, config, oauth, api-applicants,
// deliveries (module Go `admin`, réservé superadmin côté API).
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { createClient } from '@qoe/supabase/server';
import { FLAGS } from '@qoe/flags';
export interface AdminDashboardCounts {
  users: number;
  creators: number;
  articles: number;
  premiumSubscribers: number;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  role: string;
  isCertified: boolean;
  isShadowbanned: boolean;
  isSuspended: boolean;
  suspendReason: string | null;
  subdomain: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  role: string;
  isCertified: boolean;
  isShadowbanned: boolean;
  isSuspended: boolean;
  suspendReason: string | null;
  logoUrl: string | null;
  publicationId: string | null;
  subdomain: string | null;
  publicationName: string | null;
  articlesCount: number;
  subscribersCount: number;
  walletTransactions: number;
  revenueCents: number;
  createdAt: string;
}

/** 📊 Compteurs globaux (page Overview). */
export async function getAdminDashboard(): Promise<AdminDashboardCounts> {
  return goFetch<AdminDashboardCounts>('/v1/admin/dashboard');
}

/** 👥 Liste des utilisateurs pour la table de modération. */
export async function getAdminUsers(): Promise<AdminUser[]> {
  return goFetch<AdminUser[]>('/v1/admin/users');
}

/** 🔍 Détail d'un utilisateur (page users/[id]). */
export async function getAdminUserDetail(id: string): Promise<AdminUserDetail | null> {
  try {
    return await goFetch<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(id)}`);
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

// ── Pages auxiliaires ─────────────────────────────────────────────────────────

export interface AdminArticle {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  isEditorPick: boolean;
  createdAt: string;
  authorName: string | null;
  authorEmail: string;
}

export interface AdminTrend {
  id: string;
  hashtag: string;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromo {
  id: string;
  title: string;
  description: string;
  ctaText: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWidgets {
  articles: AdminArticle[];
  trends: AdminTrend[];
  promos: AdminPromo[];
}

export interface SystemConfigItem {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface AdminOAuthClient {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string | null;
  redirectUris: string[];
  scopes: string[];
  clientType: string;
  status: string;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string;
  ownerUsername: string | null;
}

export interface AdminApiApplicant {
  id: string;
  name: string | null;
  email: string;
  subdomain: string | null;
  apiAccessStatus: string;
  apiGrants: string[];
  apiApplicationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminApiModule {
  key: string;
  label: string;
  description: string;
  category: string;
  enabled: boolean;
}

export interface AdminDelivery {
  id: string;
  recipient: string;
  status: string;
  channel: string;
  attempts: number;
  provider: string | null;
  lastError: string | null;
  createdAt: string;
  notification: { type: string; articleTitle: string | null };
}

/** 🧩 Widgets & tendances (articles + tendances + promos). */
export async function getAdminWidgets(): Promise<AdminWidgets> {
  return goFetch<AdminWidgets>('/v1/admin/widgets');
}

/** 🚩 Config système (toutes ou filtrée par clés — page config / frontend / traductions). */
export async function getReservedIdentifiers(kind: 'username' | 'subdomain'): Promise<string[]> {
  const configs = await getSystemConfigs([`RESERVED_${kind.toUpperCase()}S`]);
  return (configs[0]?.value ?? '').split(/[\\n,\\r ]+/).filter(Boolean);
}

export async function getSystemConfigs(keys?: string[]): Promise<SystemConfigItem[]> {
  const qs = keys && keys.length > 0 ? `?keys=${encodeURIComponent(keys.join(','))}` : '';
  return goFetch<SystemConfigItem[]>(`/v1/admin/config${qs}`);
}

/** 🔐 Applications OAuth (audit + approbation). */
export async function getOAuthClients(): Promise<AdminOAuthClient[]> {
  return goFetch<AdminOAuthClient[]>('/v1/admin/oauth/clients');
}

/** 🛠️ Demandes d'accès API. */
export async function getApiApplicants(): Promise<AdminApiApplicant[]> {
  return goFetch<AdminApiApplicant[]>('/v1/admin/api-applicants');
}

/** 🧩 Registre des permissions d'accès API modulables (API entrante / sortante / OAuth). */
export async function getApiAccessModules(): Promise<AdminApiModule[]> {
  return goFetch<AdminApiModule[]>('/v1/admin/api-access/modules');
}

export interface ModerationReportItem {
  id: string;
  targetId: string;
  targetType: string;
  reason: string;
  details: string | null;
  status: string;
  actionTaken: string;
  createdAt: string;
  targetPreview: string | null;
  targetCount: number;
  reporter: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
  };
}

/** 🛡️ File de modération : signalements (pending en premier) + badge pending. */
export async function getAdminReports(
  status?: string
): Promise<{ items: ModerationReportItem[]; pending: number }> {
  const qs = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return goFetch<{ items: ModerationReportItem[]; pending: number }>(`/v1/admin/reports${qs}`);
}

/** 📬 Livraisons de notifications (compteurs + 50 dernières). */
export async function getAdminDeliveries(): Promise<{
  counts: Record<string, number>;
  total: number;
  deliveries: AdminDelivery[];
}> {
  return goFetch<{ counts: Record<string, number>; total: number; deliveries: AdminDelivery[] }>(
    '/v1/admin/deliveries'
  );
}

export interface AdminAuditEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** 🛡️ Journal d'audit superadmin (qui, quand, quoi — flag admin-audit-log). */
export async function getAdminAuditLog(limit = 100): Promise<AdminAuditEntry[]> {
  const data = await goFetch<{ items: AdminAuditEntry[] }>(`/v1/admin/audit-log?limit=${limit}`);
  return data.items;
}

// ── ⚖️ Contenu juridique ─────────────────────────────────────────────────────

export interface AdminLegalDocument {
  id: string;
  slug: string;
  category: string;
  audience: string;
  requiresAcceptance: boolean;
  isActive: boolean;
  sortOrder: number;
  versionsCount: number;
  draftsCount: number;
  acceptancesCount: number;
  publishedVersion?: string;
  publishedLocale?: string;
  publishedTitle?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminLegalVersion {
  id: string;
  documentId: string;
  documentSlug?: string;
  locale: string;
  version: string;
  title: string;
  summary: string;
  body?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  changelog?: string;
  effectiveAt?: string;
  publishedAt?: string;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminLegalAcceptance {
  id: string;
  documentId: string;
  documentSlug?: string;
  category?: string;
  versionId: string;
  version: string;
  locale: string;
  acceptedAt: string;
  source: string;
  method: string;
  ip?: string;
  userAgent?: string;
  userEmail?: string;
}

export interface AdminLegalStats {
  id: string;
  slug: string;
  requiresAcceptance: boolean;
  acceptances: number;
  acceptances30d: number;
  versionsCount: number;
}

/** ⚖️ Tous les documents juridiques (brouillons et inactifs inclus). */
export async function getAdminLegalDocuments(): Promise<AdminLegalDocument[]> {
  const data = await goFetch<{ items: AdminLegalDocument[] }>('/v1/admin/legal');
  return data.items;
}

/** 📚 Toutes les versions d'un document (drafts, publiées, archivées). */
export async function getAdminLegalVersions(documentId: string): Promise<AdminLegalVersion[]> {
  const data = await goFetch<{ items: AdminLegalVersion[] }>(
    `/v1/admin/legal/${encodeURIComponent(documentId)}/versions`
  );
  return data.items;
}

/** ✍️ Preuves de consentement (qui a accepté quelle version). */
export async function getAdminLegalAcceptances(
  slug?: string,
  limit = 100
): Promise<AdminLegalAcceptance[]> {
  const qs = new URLSearchParams();
  if (slug) qs.set('slug', slug);
  qs.set('limit', String(limit));
  const data = await goFetch<{ items: AdminLegalAcceptance[] }>(
    `/v1/admin/legal/acceptances?${qs.toString()}`
  );
  return data.items;
}

/** 📊 Volumétrie de consentement par document. */
export async function getAdminLegalStats(): Promise<AdminLegalStats[]> {
  const data = await goFetch<{ items: AdminLegalStats[] }>('/v1/admin/legal/stats');
  return data.items;
}

// ─── Conformité ──────────────────────────────────────────────────────

/** État de conformité d'un document (couverture, version publiée, angles morts). */
export interface ComplianceDocument {
  id: string;
  slug: string;
  category: string;
  audience: string;
  requiresAcceptance: boolean;
  isActive: boolean;
  publishedVersion: string;
  publishedLocales: number;
  distinctLocales: number;
  draftsCount: number;
  totalAcceptances: number;
  currentAcceptances: number;
  coveragePercent: number;
  lastPublishedAt?: string;
  lastAcceptedAt?: string;
  status: 'ok' | 'warning' | 'critical';
  issues: string[];
}

/** Échéance réglementaire suivie par la console. */
export interface ComplianceObligation {
  key: string;
  label: string;
  document: string;
  legal: string;
  cadenceDays: number;
  lastDone?: string;
  nextDue?: string;
  daysLeft?: number;
  status: 'ok' | 'soon' | 'overdue' | 'unknown';
}

/** Campagne d'information déclenchée par la publication d'une version. */
export interface LegalNotice {
  id: string;
  documentId: string;
  documentSlug: string;
  versionId: string;
  version: string;
  locale: string;
  title: string;
  changelog?: string;
  portalPath: string;
  createdAt?: string;
  deliveries: number;
  sent: number;
  failed: number;
}

/** Journal agrégé des choix de traceurs. */
export interface CookieConsentStats {
  total: number;
  last30d: number;
  distinctBrowsers: number;
  analyticsOptIn: number;
  analyticsOptOut: number;
  lastChoiceAt?: string;
}

/** Photographie de conformité complète. */
export interface ComplianceSnapshot {
  generatedAt: string;
  documents: ComplianceDocument[];
  obligations: ComplianceObligation[];
  notices: LegalNotice[];
  cookieConsent?: CookieConsentStats;
  eligibleUsers: number;
  creatorUsers: number;
  usersWithGaps: number;
  pendingAcceptances: number;
  summary: {
    score: number;
    critical: number;
    warning: number;
    documentsTracked: number;
    missingPublications: number;
    overdueObligations: number;
  };
}

/** 🛡️ Photographie de conformité (couverture, publications manquantes, échéances). */
export async function getAdminLegalCompliance(): Promise<ComplianceSnapshot> {
  return goFetch<ComplianceSnapshot>('/v1/admin/legal/compliance');
}

/** 📣 Campagnes d'information légale (avec état d'envoi). */
export async function getAdminLegalNotices(limit = 20): Promise<LegalNotice[]> {
  const data = await goFetch<{ items: LegalNotice[] }>(`/v1/admin/legal/notices?limit=${limit}`);
  return data.items;
}

// ─── Registre signé des consentements ────────────────────────────────

/** Périmètre (rejoué à l'identique) d'un export du registre. */
export interface ConsentExportFilters {
  slug?: string;
  userId?: string;
  consentId?: string;
  from?: string;
  to?: string;
  maxRows?: number;
  includeCookieJournal?: boolean;
}

/** Une pièce du registre des exports, telle qu'elle est scellée. */
export interface ConsentExportRecord {
  id: string;
  seq: number;
  scope: 'full' | 'document' | 'user' | 'window';
  subject?: string;
  reason?: string;
  filters: ConsentExportFilters;
  generatedAt?: string;
  requestedBy?: string;
  requestedByEmail?: string;
  documentsCount: number;
  acceptancesCount: number;
  cookieRecordsCount: number;
  contentSha256: string;
  previousChain?: string;
  chainSha256: string;
  signature: string;
  keyId: string;
  algorithm: string;
}

/** Verdict du contrôle de chaîne des exports. */
export interface ConsentExportVerification {
  total: number;
  valid: number;
  broken: { exportId: string; seq: number; reason: string }[];
  headChain?: string;
  keyId?: string;
  checkedAt: string;
}

/** 🧾 Registre des exports signés (les plus récents d'abord). */
export async function getAdminConsentExports(limit = 25): Promise<ConsentExportRecord[]> {
  try {
    const data = await goFetch<{ items: ConsentExportRecord[] }>(
      `/v1/admin/legal/consent-exports?limit=${limit}`
    );
    return data.items ?? [];
  } catch {
    return [];
  }
}

/** 🔐 Recalcule la chaîne de signatures : la pièce est-elle intacte ? */
export async function verifyAdminConsentExports(): Promise<ConsentExportVerification | null> {
  try {
    return await goFetch<ConsentExportVerification>('/v1/admin/legal/consent-exports/verify');
  } catch {
    return null;
  }
}

// ─── Cycle de vie légal ──────────────────────────────────────────────

/** Une revue périodique suivie par la console. */
export interface AdminLegalReview {
  id: string;
  documentId: string;
  documentSlug: string;
  audience: string;
  ruleKey: string;
  label: string;
  legal: string;
  dueAt?: string;
  daysLeft: number;
  status: 'OPEN' | 'DRAFTED' | 'PUBLISHED' | 'DISMISSED';
  draftVersionId?: string;
  draftVersion?: string;
  draftScheduledAt?: string;
  notes?: string;
  openedAt?: string;
  completedAt?: string;
  reminders: number;
  remindersSent: number;
}

/** 🔄 Revues périodiques (échéances ouvertes et historique récent). */
export async function getAdminLegalReviews(limit = 100): Promise<AdminLegalReview[]> {
  try {
    const data = await goFetch<{ items: AdminLegalReview[] }>(
      `/v1/admin/legal/reviews?limit=${limit}`
    );
    return data.items ?? [];
  } catch {
    return [];
  }
}

export interface FeatureFlagItem {
  key: string;
  is_enabled: boolean;
  description: string | null;
  target_roles: string[];
  updated_at?: string;
}

/** 🚩 Feature flags : liste complète depuis Supabase (avec fallback registre). */
export async function getAdminFeatureFlags(): Promise<FeatureFlagItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, is_enabled, description, target_roles, updated_at')
      .order('key', { ascending: true });

    if (!error && data && data.length > 0) {
      return data as FeatureFlagItem[];
    }
  } catch {
    // Dégradation gracieuse
  }

  // Fallback sur les flags déclarés
  return Object.entries(FLAGS).map(([key, is_enabled]) => ({
    key,
    is_enabled,
    description: null,
    target_roles: ['all'],
  }));
}
