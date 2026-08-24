// =====================================================================
// 🛡️ admin-data — couche de données de la console superadmin
// =====================================================================
// Go en primaire : GET /v1/admin/dashboard, GET /v1/admin/users,
// GET /v1/admin/users/{id} (module Go `admin`, réservé superadmin côté
// API). Fallback Prisma dev uniquement si QOE_API_URL est absent.
// =====================================================================

import { prisma } from '@qoe/db/client';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';

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
  if (isGoEnabled()) {
    return goFetch<AdminDashboardCounts>('/v1/admin/dashboard');
  }
  // 🐢 Fallback dev (sans QOE_API_URL) : Prisma.
  const [users, creators, articles, premiumSubscribers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'creator' } }),
    prisma.article.count(),
    prisma.subscriber.count({ where: { isPremium: true, isActive: true } }),
  ]);
  return { users, creators, articles, premiumSubscribers };
}

/** 👥 Liste des utilisateurs pour la table de modération. */
export async function getAdminUsers(): Promise<AdminUser[]> {
  if (isGoEnabled()) {
    return goFetch<AdminUser[]>('/v1/admin/users');
  }
  // 🐢 Fallback dev : Prisma.
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      role: true,
      isCertified: true,
      isShadowbanned: true,
      isSuspended: true,
      suspendReason: true,
      createdAt: true,
      updatedAt: true,
      publication: { select: { subdomain: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    role: u.role,
    isCertified: u.isCertified,
    isShadowbanned: u.isShadowbanned,
    isSuspended: u.isSuspended,
    suspendReason: u.suspendReason,
    subdomain: u.publication?.subdomain ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));
}

/** 🔍 Détail d'un utilisateur (page users/[id]). */
export async function getAdminUserDetail(id: string): Promise<AdminUserDetail | null> {
  if (isGoEnabled()) {
    return goFetch<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(id)}`);
  }
  // 🐢 Fallback dev : Prisma.
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      publication: {
        select: {
          subdomain: true,
          name: true,
          _count: { select: { articles: true, subscribers: true } },
        },
      },
      _count: { select: { walletTransactions: true } },
    },
  });
  if (!user) return null;

  const revenue = await prisma.walletTransaction.aggregate({
    where: { userId: user.id, type: 'SUBSCRIPTION_PAYMENT' },
    _sum: { amountCents: true },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    isCertified: user.isCertified,
    isShadowbanned: user.isShadowbanned,
    isSuspended: user.isSuspended,
    suspendReason: user.suspendReason,
    logoUrl: user.logoUrl,
    publicationId: user.publicationId,
    subdomain: user.publication?.subdomain ?? null,
    publicationName: user.publication?.name ?? null,
    articlesCount: user.publication?._count?.articles ?? 0,
    subscribersCount: user.publication?._count?.subscribers ?? 0,
    walletTransactions: user._count.walletTransactions,
    revenueCents: revenue._sum.amountCents || 0,
    createdAt: user.createdAt.toISOString(),
  };
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
  if (isGoEnabled()) {
    return goFetch<AdminWidgets>('/v1/admin/widgets');
  }
  // 🐢 Fallback dev : Prisma.
  const [articles, trends, promos] = await Promise.all([
    prisma.article.findMany({
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.trend.findMany({ orderBy: { count: 'desc' } }),
    prisma.partnerPromo.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    articles: articles.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      published: a.published,
      isEditorPick: a.isEditorPick,
      createdAt: a.createdAt.toISOString(),
      authorName: a.author.name,
      authorEmail: a.author.email,
    })),
    trends: trends.map((t) => ({
      id: t.id,
      hashtag: t.hashtag,
      count: t.count,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    promos: promos.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      ctaText: p.ctaText,
      ctaUrl: p.ctaUrl,
      imageUrl: p.imageUrl,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}

/** 🚩 Config système (toutes ou filtrée par clés — page config / frontend / traductions). */
export async function getSystemConfigs(keys?: string[]): Promise<SystemConfigItem[]> {
  if (isGoEnabled()) {
    const qs = keys && keys.length > 0 ? `?keys=${encodeURIComponent(keys.join(','))}` : '';
    return goFetch<SystemConfigItem[]>(`/v1/admin/config${qs}`);
  }
  // 🐢 Fallback dev : Prisma.
  const configs = await prisma.systemConfig.findMany({
    where: keys && keys.length > 0 ? { key: { in: keys } } : undefined,
    orderBy: { key: 'asc' },
  });
  return configs.map((c) => ({
    key: c.key,
    value: c.value,
    description: c.description,
    updatedAt: c.updatedAt.toISOString(),
  }));
}

/** 🔐 Applications OAuth (audit + approbation). */
export async function getOAuthClients(): Promise<AdminOAuthClient[]> {
  if (isGoEnabled()) {
    return goFetch<AdminOAuthClient[]>('/v1/admin/oauth/clients');
  }
  // 🐢 Fallback dev : Prisma.
  const clients = await prisma.oAuthClient.findMany({
    orderBy: { createdAt: 'desc' },
    include: { owner: { select: { name: true, email: true, username: true } } },
  });
  return clients.map((c) => ({
    id: c.id,
    clientId: c.clientId,
    name: c.name,
    description: c.description,
    logoUrl: c.logoUrl,
    homepageUrl: c.homepageUrl,
    redirectUris: c.redirectUris,
    scopes: c.scopes,
    clientType: c.clientType,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    ownerName: c.owner.name,
    ownerEmail: c.owner.email,
    ownerUsername: c.owner.username,
  }));
}

/** 🛠️ Demandes d'accès API. */
export async function getApiApplicants(): Promise<AdminApiApplicant[]> {
  if (isGoEnabled()) {
    return goFetch<AdminApiApplicant[]>('/v1/admin/api-applicants');
  }
  // 🐢 Fallback dev : Prisma.
  const applicants = await prisma.user.findMany({
    where: { role: { in: ['creator', 'superadmin'] }, apiAccessStatus: { not: 'none' } },
    select: {
      id: true,
      name: true,
      email: true,
      publication: { select: { subdomain: true } },
      apiAccessStatus: true,
      apiApplicationReason: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  return applicants.map((app) => ({
    id: app.id,
    name: app.name,
    email: app.email,
    subdomain: app.publication?.subdomain ?? null,
    apiAccessStatus: app.apiAccessStatus,
    apiApplicationReason: app.apiApplicationReason,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  }));
}

/** 📬 Livraisons de notifications (compteurs + 50 dernières). */
export async function getAdminDeliveries(): Promise<{
  counts: Record<string, number>;
  total: number;
  deliveries: AdminDelivery[];
}> {
  if (isGoEnabled()) {
    return goFetch<{ counts: Record<string, number>; total: number; deliveries: AdminDelivery[] }>(
      '/v1/admin/deliveries'
    );
  }
  // 🐢 Fallback dev : Prisma.
  const [groups, deliveries, total] = await Promise.all([
    prisma.notificationDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.notificationDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { notification: { select: { type: true, article: { select: { title: true } } } } },
    }),
    prisma.notificationDelivery.count(),
  ]);
  const counts: Record<string, number> = {};
  for (const g of groups) counts[g.status] = g._count._all;
  return {
    counts,
    total,
    deliveries: deliveries.map((d) => ({
      id: d.id,
      recipient: d.recipient,
      status: d.status,
      channel: d.channel,
      attempts: d.attempts,
      provider: d.provider,
      lastError: d.lastError,
      createdAt: d.createdAt.toISOString(),
      notification: {
        type: d.notification.type,
        articleTitle: d.notification.article?.title ?? null,
      },
    })),
  };
}
