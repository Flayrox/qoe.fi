import { prisma } from '@qoe/db/client';
import { follows } from '@qoe/db';
import type { FeedArticleDTO } from '@qoe/db/types';

interface ProfilePostData {
  id: string;
  content: string;
  imageUrl: string | null;
  createdAt: Date;
  triggerWarning?: string | null;
  isPinned?: boolean;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  };
  parentId?: string | null;
  repostId?: string | null;
  parent?: ProfilePostData | null;
  repost?: ProfilePostData | null;
  likesCount?: number;
  repliesCount?: number;
  repostsCount?: number;
  liked?: boolean;
  _count?: { likes?: number; replies?: number; reposts?: number };
}

export interface ProfileUser {
  id: string;
  ownerUserId?: string | null;
  type: 'PERSONAL' | 'MEDIA';
  name: string | null;
  username: string | null;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  headerImageUrl: string | null;
  onboardingText: string | null;
  isCertified: boolean;
  createdAt: string;
  posts: ProfilePostData[];
  articles: FeedArticleDTO[];
  _count: {
    followers: number;
    following: number;
    posts: number;
    articles: number;
  };
}

/**
 * 📰 Résout un profil de publication (personnel OU média) par handle.
 * Retourne le profil mappé pour ProfileView + les métadonnées de follow.
 */
export async function resolveProfileByHandle(rawHandle: string, viewerId?: string | null) {
  const handle = decodeURIComponent(rawHandle).replace(/^@/, '');

  const publication = await prisma.publication.findFirst({
    where: {
      OR: [
        { slug: { equals: handle, mode: 'insensitive' } },
        { subdomain: { equals: handle, mode: 'insensitive' } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          onboardingText: true,
          settings: { select: { profileVisibility: true } },
        },
      },
      articles: {
        where: { published: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          category: { select: { name: true } },
          author: { select: { id: true, name: true, username: true, logoUrl: true } },
          attributions: {
            where: { consentStatus: 'ACCEPTED', isVisible: true },
            orderBy: { order: 'asc' },
            include: {
              user: {
                select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
              },
            },
          },
        },
      },
      _count: { select: { followers: true, articles: true } },
    },
  });

  if (!publication) return null;

  // Respecte la visibilité choisie dans les réglages avant de charger le contenu du profil.
  // Les médias restent publics ; la confidentialité s'applique au profil personnel.
  const profileVisibility = publication.user?.settings?.profileVisibility || 'PUBLIC';
  if (publication.user && profileVisibility !== 'PUBLIC') {
    const isOwner = viewerId === publication.user.id;
    const canView =
      isOwner ||
      (profileVisibility === 'FOLLOWERS' &&
        Boolean(viewerId && (await follows.isFollowing(viewerId, publication.id))));
    if (!canView) return null;
  }

  // Posts (thoughts) : uniquement pour les publications personnelles (auteur = le user)
  let posts: ProfilePostData[] = [];
  if (publication.type === 'PERSONAL' && publication.user) {
    posts = (await prisma.thought.findMany({
      where: { authorId: publication.user.id, isDraft: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: {
          select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
        },
        parent: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: {
              select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
            },
          },
        },
        likes: { select: { userId: true } },
        repost: {
          include: {
            author: {
              select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
            },
          },
        },
        _count: { select: { likes: true, replies: true, reposts: true } },
      },
    })) as unknown as ProfilePostData[];
  }

  const followingCount = publication.user ? await follows.countFollowing(publication.user.id) : 0;

  const articles = publication.articles.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    author: {
      id: publication.id,
      name: publication.name,
      username: publication.slug,
      subdomain: publication.subdomain,
      customDomain: publication.customDomain,
      logoUrl: publication.logoUrl,
      heroText: publication.heroText,
      isCertified: publication.isCertified,
      type: publication.type,
      authorName: a.author?.name ?? null,
      contributors: a.attributions.map((attribution) => ({
        id: attribution.user.id,
        name: attribution.user.name,
        username: attribution.user.username,
        logoUrl: attribution.user.logoUrl,
        isCertified: attribution.user.isCertified,
        role: attribution.role,
        order: attribution.order,
        isVisible: attribution.isVisible,
        consentStatus: attribution.consentStatus,
      })),
    },
  })) as unknown as FeedArticleDTO[];

  const profileUser: ProfileUser = {
    id: publication.id,
    ownerUserId: publication.user?.id ?? null,
    type: publication.type,
    name: publication.name,
    username: publication.slug,
    subdomain: publication.subdomain,
    customDomain: publication.customDomain,
    logoUrl: publication.logoUrl,
    heroText: publication.heroText,
    headerImageUrl: publication.headerImageUrl,
    onboardingText: publication.user?.onboardingText ?? null,
    isCertified: publication.isCertified,
    createdAt: publication.createdAt.toISOString(),
    posts,
    articles,
    _count: {
      followers: publication._count.followers,
      following: followingCount,
      posts: posts.length,
      articles: publication._count.articles,
    },
  };

  return {
    profileUser,
    ownerUserId: publication.user?.id ?? null,
    publicationId: publication.id,
  };
}

export async function isFollowingPublication(readerId: string, publicationId: string) {
  return follows.isFollowing(readerId, publicationId);
}
