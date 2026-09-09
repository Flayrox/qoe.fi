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
