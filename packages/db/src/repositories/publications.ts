// =====================================================================
// 📰 Publications Repository — Entité polymorphe (User personnel | Media)
// =====================================================================
// 📖 La "Publication" est l'identité brand/tenant : un User possède une
//    publication personnelle (PERSONAL), un Média en possède une (MEDIA).
//    Tout ce qui est tenant (subdomain, design, SEO, followers, abonnés,
//    tiers) vit ici, ce qui rend User et Media interchangeables pour le
//    web tenant, le feed et le studio.
// =====================================================================

import { prisma } from '../client';
import type { Prisma, Publication, PublicationType } from '@prisma/client';

export interface PublicationInput {
  name: string;
  slug: string;
  bio?: string | null;
  logoUrl?: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  umamiWebsiteId?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  heroText?: string | null;
  headerImageUrl?: string | null;
  footerText?: string | null;
  themeMode?: string | null;
  layoutStyle?: string | null;
  allowIndexing?: boolean;
  allowPublicAnnotations?: boolean;
  allowComments?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  supportUrl?: string | null;
  stripeAccountId?: string | null;
  isCertified?: boolean;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `pub-${Date.now().toString(36)}`
  );
}

/**
 * ✨ Crée la publication personnelle d'un utilisateur (PERSONAL).
 * Hérite des champs tenant déjà présents sur le User (rétro-compatibilité).
 */
export async function createPersonalPublication(
  userId: string,
  input?: Partial<PublicationInput>
): Promise<Publication> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Utilisateur introuvable');

  const slug = input?.slug || user.username || slugify(user.name || user.email.split('@')[0]);

  const publication = await prisma.publication.create({
    data: {
      type: 'PERSONAL',
      name: input?.name || user.name || user.username || 'Créateur',
      slug,
      bio: input?.bio ?? null,
      logoUrl: input?.logoUrl ?? user.logoUrl,
      subdomain: input?.subdomain ?? null,
      customDomain: input?.customDomain ?? null,
      umamiWebsiteId: input?.umamiWebsiteId ?? null,
      accentColor: input?.accentColor ?? null,
      fontFamily: input?.fontFamily ?? null,
      heroText: input?.heroText ?? null,
      headerImageUrl: input?.headerImageUrl ?? null,
      footerText: input?.footerText ?? null,
      themeMode: input?.themeMode ?? 'system',
      layoutStyle: input?.layoutStyle ?? 'minimal',
      allowIndexing: input?.allowIndexing ?? true,
      allowPublicAnnotations: input?.allowPublicAnnotations ?? true,
      allowComments: input?.allowComments ?? true,
      seoTitle: input?.seoTitle ?? null,
      seoDescription: input?.seoDescription ?? null,
      supportUrl: input?.supportUrl ?? null,
      stripeAccountId: input?.stripeAccountId ?? null,
      isCertified: input?.isCertified ?? user.isCertified,
      user: { connect: { id: userId } },
    },
  });

  // Relie le User à sa publication personnelle
  await prisma.user.update({
    where: { id: userId },
    data: { publicationId: publication.id },
  });

  return publication;
}

/**
 * 🔎 Retourne la publication personnelle d'un utilisateur, ou null.
 */
export async function getPersonalPublication(userId: string) {
  return prisma.publication.findFirst({
    where: { type: 'PERSONAL', user: { id: userId } },
    include: {
      navigation: { orderBy: { order: 'asc' } },
      socialLinks: { orderBy: { order: 'asc' } },
    },
  });
}

/**
 * 🏗️ Retourne (ou crée) la publication personnelle d'un utilisateur.
 * À appeler après la création d'un compte / l'onboarding créateur.
 */
export async function getOrCreatePersonalPublication(userId: string): Promise<Publication> {
  const existing = await getPersonalPublication(userId);
  if (existing) return existing;
  return createPersonalPublication(userId);
}

/**
 * 🔗 Résout une publication par subdomain OU customDomain (tenant).
 * Polymorphe : fonctionne pour les publications personnelles ET média.
 */
export async function findByDomain(domain: string) {
  return prisma.publication.findFirst({
    where: {
      OR: [{ subdomain: domain }, { customDomain: domain }],
    },
    include: {
      navigation: { orderBy: { order: 'asc' } },
      socialLinks: { orderBy: { order: 'asc' } },
    },
  });
}

/**
 * 🔗 Résout une publication par son slug (handle).
 */
export async function findBySlug(slug: string) {
  return prisma.publication.findUnique({
    where: { slug },
    include: {
      navigation: { orderBy: { order: 'asc' } },
      socialLinks: { orderBy: { order: 'asc' } },
    },
  });
}

/**
 * 🔁 Garde le User et sa publication personnelle synchronisés
 * quand le créateur met à jour son profil / son studio.
 */
export async function syncUserPublication(userId: string, data: Partial<PublicationInput>) {
  const publication = await getOrCreatePersonalPublication(userId);

  const publicationData: Prisma.PublicationUpdateInput = {
    name: data.name,
    bio: data.bio ?? undefined,
    logoUrl: data.logoUrl ?? undefined,
    subdomain: data.subdomain ?? undefined,
    customDomain: data.customDomain ?? undefined,
    umamiWebsiteId: data.umamiWebsiteId ?? undefined,
    accentColor: data.accentColor ?? undefined,
    fontFamily: data.fontFamily ?? undefined,
    heroText: data.heroText ?? undefined,
    headerImageUrl: data.headerImageUrl ?? undefined,
    footerText: data.footerText ?? undefined,
    themeMode: data.themeMode ?? undefined,
    layoutStyle: data.layoutStyle ?? undefined,
    allowIndexing: data.allowIndexing ?? undefined,
    allowPublicAnnotations: data.allowPublicAnnotations ?? undefined,
    allowComments: data.allowComments ?? undefined,
    seoTitle: data.seoTitle ?? undefined,
    seoDescription: data.seoDescription ?? undefined,
    supportUrl: data.supportUrl ?? undefined,
    stripeAccountId: data.stripeAccountId ?? undefined,
    isCertified: data.isCertified ?? undefined,
  };

  const [updatedPublication] = await prisma.$transaction([
    prisma.publication.update({
      where: { id: publication.id },
      data: publicationData,
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name ?? undefined,
        logoUrl: data.logoUrl ?? undefined,
        isCertified: data.isCertified ?? undefined,
      },
    }),
  ]);

  return updatedPublication;
}

/**
 * 🧹 Supprime la publication personnelle d'un utilisateur (cascade des contenus liés).
 */
export async function deletePersonalPublication(userId: string) {
  const pub = await getPersonalPublication(userId);
  if (!pub) return;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { publicationId: null } }),
    prisma.publication.delete({ where: { id: pub.id } }),
  ]);
}

export type { Publication, PublicationType };
