// =====================================================================
// 🛡️ admin-data — couche de données de la console superadmin
// =====================================================================
// Go en primaire : GET /v1/admin/dashboard, GET /v1/admin/users,
// GET /v1/admin/users/{id}, widgets, config, oauth, api-applicants,
// deliveries (module Go `admin`, réservé superadmin côté API).
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

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
  apiApplicationReason: string | null;
  createdAt: string;
  updatedAt: string;
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
