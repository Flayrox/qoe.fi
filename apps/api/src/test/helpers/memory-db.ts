// =====================================================================
// 🗄️ Prisma In-Memory Mock — apps/api tests
// =====================================================================
// 📖 Une vraie base mémoire, pas des vi.fn() qui renvoient des valeurs
//    codées en dur. Les handlers Hono écrivent/lisent cette structure de
//    données comme s'il s'agissait de Prisma → les tests couvrent le
//    comportement réel (création, toggle, comptage, filtrage).
//
// 🎯 Déterministe : chaque test repart d'un état propre via `reset()`.
//    Aucune connexion réseau, aucun flaky.
// =====================================================================

import { createHash } from 'node:crypto';
import type { Prisma, User } from '@qoe/db/client';

type Uuid = string;

type ApiKeyRow = {
  id: Uuid;
  keyHash: string;
  userId: Uuid;
  lastUsedAt: Date | null;
  user: User;
};

type ArticleRow = {
  id: Uuid;
  title: string;
  slug: string;
  content: string;
  authorId: Uuid;
  published: boolean;
  visibility: string;
  tierId: string | null;
  readingTime: number | null;
  isPremium: boolean;
  createdAt: Date;
  updatedAt: Date;
  categoryId: string | null;
  category: { id: string; name: string; slug: string; description: string | null } | null;
};

type CategoryRow = {
  id: Uuid;
  publicationId: Uuid;
  name: string;
  slug: string;
  description: string | null;
};

type PublicationRow = {
  id: Uuid;
  type: 'PERSONAL' | 'MEDIA';
  name: string;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  headerImageUrl: string | null;
  isCertified: boolean;
  umamiWebsiteId: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  themeMode: string | null;
  layoutStyle: string | null;
  allowIndexing: boolean;
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  supportUrl: string | null;
  stripeAccountId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  user: User | null;
  createdAt: Date;
  updatedAt: Date;
};

type ThoughtRow = {
  id: Uuid;
  authorId: Uuid;
  content: string;
  imageUrl: string | null;
  triggerWarning: string | null;
  visibility: string;
  repostId: string | null;
  createdAt: Date;
  author: ThoughtAuthor;
};

type ThoughtAuthor = {
  id: Uuid;
  name: string;
  username: string;
  subdomain: string | null;
  logoUrl: string | null;
  isCertified: boolean;
};

type LikeRow = { id: Uuid; userId: Uuid; postId: Uuid };
type BookmarkRow = { id: Uuid; readerId: Uuid; articleId: Uuid };
type FollowRow = { id: Uuid; readerId: Uuid; publicationId: Uuid };

function newId(prefix: string): Uuid {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createMemoryDb() {
  let users: User[] = [];
  let publications: PublicationRow[] = [];
  let apiKeys: ApiKeyRow[] = [];
  let articles: ArticleRow[] = [];
  let categories: CategoryRow[] = [];
  let thoughts: ThoughtRow[] = [];
  let likes: LikeRow[] = [];
  let bookmarks: BookmarkRow[] = [];
  let follows: FollowRow[] = [];

  function reset() {
    users = [];
    publications = [];
    apiKeys = [];
    articles = [];
    categories = [];
    thoughts = [];
    likes = [];
    bookmarks = [];
    follows = [];
  }

  type SeedUserInput = Partial<User> & {
    id: string;
    email: string;
    name?: string;
    subdomain?: string | null;
    customDomain?: string | null;
    heroText?: string | null;
    headerImageUrl?: string | null;
    footerText?: string | null;
    umamiWebsiteId?: string | null;
    accentColor?: string | null;
    fontFamily?: string | null;
    themeMode?: string | null;
    layoutStyle?: string | null;
    allowIndexing?: boolean;
    allowPublicAnnotations?: boolean;
    allowComments?: boolean;
    supportUrl?: string | null;
    stripeAccountId?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  };

  function seedUser(data: SeedUserInput): User {
    const user: User = {
      id: data.id,
      email: data.email,
      name: data.name ?? 'Test User',
      username: data.username ?? null,
      logoUrl: data.logoUrl ?? null,
      isCertified: data.isCertified ?? false,
      role: data.role ?? 'user',
      isShadowbanned: data.isShadowbanned ?? false,
      isSuspended: data.isSuspended ?? false,
      suspendReason: data.suspendReason ?? null,
      forceStandardTheme: data.forceStandardTheme ?? false,
      onboardingText: data.onboardingText ?? null,
      advancedSettingsMode: data.advancedSettingsMode ?? false,
      hasCompletedOnboarding: data.hasCompletedOnboarding ?? false,
      apiAccessStatus: data.apiAccessStatus ?? 'none',
      apiApplicationReason: data.apiApplicationReason ?? null,
      walletBalanceCents: data.walletBalanceCents ?? 0,
      createdAt: data.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: data.updatedAt ?? new Date('2024-01-01T00:00:00.000Z'),
      publicationId: null,
    } as User;
    users.push(user);

    // Publication personnelle portant l'identité tenant
    const publication: PublicationRow = {
      id: data.subdomain ? `pub-${data.subdomain}` : `pub-${user.id}`,
      type: 'PERSONAL',
      name: data.name ?? 'Test User',
      slug: data.username ?? `user_${user.id}`,
      subdomain: data.subdomain ?? null,
      customDomain: data.customDomain ?? null,
      logoUrl: data.logoUrl ?? null,
      heroText: data.heroText ?? null,
      headerImageUrl: data.headerImageUrl ?? null,
      isCertified: data.isCertified ?? false,
      umamiWebsiteId: data.umamiWebsiteId ?? null,
      accentColor: data.accentColor ?? null,
      fontFamily: data.fontFamily ?? null,
      themeMode: data.themeMode ?? 'system',
      layoutStyle: data.layoutStyle ?? 'minimal',
      allowIndexing: data.allowIndexing ?? true,
      allowPublicAnnotations: data.allowPublicAnnotations ?? true,
      allowComments: data.allowComments ?? true,
      supportUrl: data.supportUrl ?? null,
      stripeAccountId: data.stripeAccountId ?? null,
      seoTitle: data.seoTitle ?? null,
      seoDescription: data.seoDescription ?? null,
      user,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    publications.push(publication);
    (user as { publicationId?: string | null }).publicationId = publication.id;
    return user;
  }

  function seedApiKey(token: string, user: User, id = newId('ak')): ApiKeyRow {
    const row: ApiKeyRow = {
      id,
      keyHash: hashApiKey(token),
      userId: user.id,
      lastUsedAt: null,
      user,
    };
    apiKeys.push(row);
    return row;
  }

  function seedCategory(data: Partial<CategoryRow> & { publicationId: string }): CategoryRow {
    const row: CategoryRow = {
      id: data.id ?? newId('cat'),
      publicationId: data.publicationId,
      name: data.name ?? 'Category',
      slug: data.slug ?? `slug-${data.publicationId}`,
      description: data.description ?? null,
    };
    categories.push(row);
    return row;
  }

  function seedArticle(data: Partial<ArticleRow> & { authorId: string; slug: string }): ArticleRow {
    const row: ArticleRow = {
      id: data.id ?? newId('art'),
      title: data.title ?? 'Article',
      slug: data.slug,
      content: data.content ?? '<p>Content</p>',
      authorId: data.authorId,
      published: data.published ?? true,
      visibility: data.visibility ?? 'public',
      tierId: data.tierId ?? null,
      readingTime: data.readingTime ?? 3,
      isPremium: data.isPremium ?? false,
      createdAt: data.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: data.updatedAt ?? data.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
      categoryId: data.categoryId ?? null,
      category: data.category ?? null,
    };
    articles.push(row);
    return row;
  }

  function seedThought(data: Partial<ThoughtRow> & { authorId: string }): ThoughtRow {
    const author = users.find((u) => u.id === data.authorId);
    const row: ThoughtRow = {
      id: data.id ?? newId('th'),
      authorId: data.authorId,
      content: data.content ?? 'Thought',
      imageUrl: data.imageUrl ?? null,
      triggerWarning: data.triggerWarning ?? null,
      visibility: data.visibility ?? 'public',
      repostId: data.repostId ?? null,
      createdAt: data.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
      author: data.author ?? {
        id: data.authorId,
        name: author?.name ?? 'Author',
        username: author?.username ?? `user_${data.authorId}`,
        subdomain: publications.find((p) => p.user?.id === data.authorId)?.subdomain ?? null,
        logoUrl: author?.logoUrl ?? null,
        isCertified: author?.isCertified ?? false,
      },
    };
    thoughts.push(row);
    return row;
  }

  function seedLike(userId: string, postId: string): LikeRow {
    const row = { id: newId('lk'), userId, postId };
    likes.push(row);
    return row;
  }

  function seedBookmark(readerId: string, articleId: string): BookmarkRow {
    const row = { id: newId('bm'), readerId, articleId };
    bookmarks.push(row);
    return row;
  }

  function seedFollow(readerId: string, publicationId: string): FollowRow {
    const row = { id: newId('fl'), readerId, publicationId };
    follows.push(row);
    return row;
  }

  const db = {
    apiKey: {
      findUnique: async ({ where }: { where: { keyHash: string } }) =>
        apiKeys.find((k) => k.keyHash === where.keyHash) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { lastUsedAt: Date } }) => {
        const row = apiKeys.find((k) => k.id === where.id);
        if (!row) throw new Error('Record not found');
        row.lastUsedAt = data.lastUsedAt;
        return row;
      },
    },
    user: {
      findFirst: async ({ where }: { where: Prisma.UserWhereInput }) => {
        const w = where as Record<string, unknown>;
        const found = users.find((u) => {
          const orClauses = w.OR;
          if (Array.isArray(orClauses) && orClauses.length > 0) {
            return (orClauses as Record<string, unknown>[]).some((clause) =>
              matchesUser(u, clause)
            );
          }
          return matchesUser(u, w);
        });
        if (!found) return null;
        // Simule le _count du select Prisma pour les profils publics.
        return {
          ...found,
          _count: {
            followers: follows.filter(
              (f) => f.publicationId === publications.find((p) => p.user?.id === found.id)?.id
            ).length,
            following: follows.filter((f) => f.readerId === found.id).length,
            posts: thoughts.filter((t) => t.authorId === found.id).length,
            articles: articles.filter((a) => a.authorId === found.id && a.published === true)
              .length,
          },
        };
      },
    },
    article: {
      findMany: async ({
        where,
        take,
        skip,
        orderBy,
      }: {
        where: Prisma.ArticleWhereInput;
        take?: number;
        skip?: number;
        orderBy?: { createdAt?: 'asc' | 'desc' };
      }) => {
        let rows = articles.filter((a) => matchesArticle(a, where));
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (skip) rows = rows.slice(skip);
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map((a) => ({ ...a }));
      },
      findFirst: async ({ where }: { where: Prisma.ArticleWhereInput }) =>
        articles.find((a) => matchesArticle(a, where)) ?? null,
      count: async ({ where }: { where: Prisma.ArticleWhereInput }) =>
        articles.filter((a) => matchesArticle(a, where)).length,
    },
    category: {
      findMany: async ({ where }: { where: Prisma.CategoryWhereInput }) => {
        const publicationId = firstScalar(where as Record<string, unknown>, 'publicationId');
        return categories
          .filter((c) => publicationId === undefined || c.publicationId === publicationId)
          .map((c) => ({
            ...c,
            _count: {
              articles: articles.filter((a) => a.categoryId === c.id && a.published === true)
                .length,
            },
          }));
      },
    },
    thought: {
      findMany: async ({
        where,
        take,
        orderBy,
      }: {
        where: Prisma.ThoughtWhereInput;
        take?: number;
        orderBy?: { createdAt?: 'asc' | 'desc' };
      }) => {
        let rows = thoughts.filter((t) => matchesThought(t, where));
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map((t) => ({ ...t }));
      },
      findFirst: async ({ where }: { where: Prisma.ThoughtWhereInput }) =>
        thoughts.find((t) => matchesThought(t, where)) ?? null,
      count: async ({ where }: { where: Prisma.ThoughtWhereInput }) =>
        thoughts.filter((t) => matchesThought(t, where)).length,
      create: async ({ data }: { data: Prisma.ThoughtCreateInput & { authorId: string } }) => {
        const author = users.find((u) => u.id === data.authorId);
        const row: ThoughtRow = {
          id: newId('th'),
          authorId: data.authorId,
          content: (data.content as string) ?? '',
          imageUrl: (data.imageUrl as string) ?? null,
          triggerWarning: (data.triggerWarning as string) ?? null,
          visibility: (data.visibility as string) ?? 'public',
          repostId:
            (data as unknown as { repostId?: string }).repostId ??
            (data.repost as { connect?: { id?: string } } | undefined)?.connect?.id ??
            null,
          createdAt: new Date(),
          author: {
            id: data.authorId,
            name: author?.name ?? 'Author',
            username: author?.username ?? `user_${data.authorId}`,
            subdomain: publications.find((p) => p.user?.id === data.authorId)?.subdomain ?? null,
            logoUrl: author?.logoUrl ?? null,
            isCertified: author?.isCertified ?? false,
          },
        };
        thoughts.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = thoughts.findIndex((t) => t.id === where.id);
        if (idx === -1) throw new Error('Record not found');
        const [removed] = thoughts.splice(idx, 1);
        return removed;
      },
    },
    like: {
      findFirst: async ({ where }: { where: Prisma.LikeWhereInput }) => {
        const userId = firstScalar(where as Record<string, unknown>, 'userId');
        const postId = firstScalar(where as Record<string, unknown>, 'postId');
        return (
          likes.find(
            (l) =>
              (userId === undefined || l.userId === userId) &&
              (postId === undefined || l.postId === postId)
          ) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: Prisma.LikeCreateInput & { userId: string; postId: string };
      }) => {
        const row = { id: newId('lk'), userId: data.userId, postId: data.postId };
        likes.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = likes.findIndex((l) => l.id === where.id);
        if (idx === -1) throw new Error('Record not found');
        const [removed] = likes.splice(idx, 1);
        return removed;
      },
      count: async ({ where }: { where: Prisma.LikeWhereInput }) => {
        const postId = firstScalar(where as Record<string, unknown>, 'postId');
        return likes.filter((l) => postId === undefined || l.postId === postId).length;
      },
    },
    bookmark: {
      findFirst: async ({ where }: { where: Prisma.BookmarkWhereInput }) => {
        const readerId = firstScalar(where as Record<string, unknown>, 'readerId');
        const articleId = firstScalar(where as Record<string, unknown>, 'articleId');
        return (
          bookmarks.find(
            (b) =>
              (readerId === undefined || b.readerId === readerId) &&
              (articleId === undefined || b.articleId === articleId)
          ) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: Prisma.BookmarkCreateInput & { readerId: string; articleId: string };
      }) => {
        const row = { id: newId('bm'), readerId: data.readerId, articleId: data.articleId };
        bookmarks.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = bookmarks.findIndex((b) => b.id === where.id);
        if (idx === -1) throw new Error('Record not found');
        const [removed] = bookmarks.splice(idx, 1);
        return removed;
      },
    },
    follows: {
      findFirst: async ({ where }: { where: Prisma.FollowsWhereInput }) => {
        const readerId = firstScalar(where as Record<string, unknown>, 'readerId');
        const publicationId = firstScalar(where as Record<string, unknown>, 'publicationId');
        return (
          follows.find(
            (f) =>
              (readerId === undefined || f.readerId === readerId) &&
              (publicationId === undefined || f.publicationId === publicationId)
          ) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: Prisma.FollowsCreateInput & { readerId: string; publicationId: string };
      }) => {
        const row = {
          id: newId('fl'),
          readerId: data.readerId,
          publicationId: data.publicationId,
        };
        follows.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = follows.findIndex((f) => f.id === where.id);
        if (idx === -1) throw new Error('Record not found');
        const [removed] = follows.splice(idx, 1);
        return removed;
      },
      count: async ({ where }: { where: Prisma.FollowsWhereInput }) => {
        const readerId = firstScalar(where as Record<string, unknown>, 'readerId');
        const publicationId = firstScalar(where as Record<string, unknown>, 'publicationId');
        return follows.filter(
          (f) =>
            (readerId === undefined || f.readerId === readerId) &&
            (publicationId === undefined || f.publicationId === publicationId)
        ).length;
      },
    },
    publication: {
      findFirst: async ({ where }: { where: Prisma.PublicationWhereInput }) => {
        const w = where as Record<string, unknown>;
        const found = publications.find((p) => {
          const orClauses = w.OR;
          if (Array.isArray(orClauses) && orClauses.length > 0) {
            return (orClauses as Record<string, unknown>[]).some((clause) =>
              matchesPublication(p, clause)
            );
          }
          return matchesPublication(p, w);
        });
        if (!found) return null;
        return {
          ...found,
          _count: {
            followers: follows.filter((f) => f.publicationId === found.id).length,
            articles: articles.filter((a) => a.authorId === found.user?.id && a.published === true)
              .length,
          },
        };
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        publications.find((p) => p.id === where.id) ?? null,
    },
  };

  return {
    db,
    seed: {
      user: seedUser,
      apiKey: seedApiKey,
      article: seedArticle,
      category: seedCategory,
      thought: seedThought,
      like: seedLike,
      bookmark: seedBookmark,
      follow: seedFollow,
    },
    reset,
  };
}

function matchesUser(u: User, clause: Record<string, unknown>): boolean {
  const id = clause.id;
  const email = clause.email;
  const username = clause.username;
  if (id !== undefined && u.id !== id) return false;
  if (email !== undefined && u.email !== email) return false;
  if (username !== undefined && u.username !== username) return false;
  return true;
}

function matchesPublication(p: PublicationRow, clause: Record<string, unknown>): boolean {
  const id = clause.id;
  const slug = clause.slug;
  const subdomain = clause.subdomain;
  if (id !== undefined && p.id !== id) return false;
  if (slug !== undefined && p.slug !== slug) return false;
  if (subdomain !== undefined && p.subdomain !== subdomain) return false;
  return true;
}

function firstScalar<T>(where: Record<string, unknown>, key: string): T | undefined {
  const direct = where[key];
  if (
    direct !== undefined &&
    (typeof direct === 'string' || typeof direct === 'boolean' || direct === null)
  ) {
    return direct as T;
  }
  const or = where.OR;
  if (Array.isArray(or)) {
    for (const clause of or as Record<string, unknown>[]) {
      const val = clause[key];
      if (val !== undefined) return val as T;
    }
  }
  return undefined;
}

function matchesArticle(a: ArticleRow, where: Prisma.ArticleWhereInput): boolean {
  const w = where as Record<string, unknown>;
  const authorId = w.authorId;
  const published = w.published;
  const slug = w.slug;
  if (authorId !== undefined && a.authorId !== authorId) return false;
  if (published !== undefined && a.published !== published) return false;
  if (slug !== undefined && a.slug !== slug) return false;
  const category = w.category as { slug?: string } | undefined;
  if (category?.slug !== undefined && a.category?.slug !== category.slug) return false;
  return true;
}

function matchesThought(t: ThoughtRow, where: Prisma.ThoughtWhereInput): boolean {
  const w = where as Record<string, unknown>;
  const authorId = w.authorId;
  const repostId = w.repostId;
  if (authorId !== undefined && t.authorId !== authorId) return false;
  if (repostId !== undefined && t.repostId !== repostId) return false;
  const createdAt = w.createdAt as { lt?: Date | string } | undefined;
  if (createdAt?.lt !== undefined) {
    const cursor = new Date(createdAt.lt);
    if (!(t.createdAt < cursor)) return false;
  }
  return true;
}
