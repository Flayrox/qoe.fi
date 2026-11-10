'use server';

// =====================================================================
// 📰 actions/articles — Server Actions du studio créateur (web uniquement)
// =====================================================================
// CRUD articles + catégories + commentaires, avec workflow média
// (soumission/revue) et RBAC `@qoe/auth` (canMedia), délégué au Go.
// - Workspace actif résolu via le cookie `qoe_active_workspace`
//   (getActivePublisherId) : personnel OU média.
// - Attribution/co-auteurs : consentement géré en base (jamais fabriqué
//   par le client), invitations + notifications de collaboration.
// - Publication : fan-out newsletter + webhooks entièrement gérés par le Go.
// 🔗 Go-only : CRUD articles/catégories/commentaires délégués à
//    l'API Go (apps/api/internal/modules/articles).
// ⚠️ Fichier serveur : non exposé au mobile (le mobile lira les articles
//    via l'API Go /v1/articles publiques).
// =====================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@qoe/supabase/server';
import { normalizeArticleAttributions, type ArticleAttributionInput } from '@qoe/utils';
import { slugify, shortId } from '@qoe/utils';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';
import {
  getActivePublisherId as resolveActivePublisherId,
  getActiveWorkspaceContext,
} from '../workspace';
import type { SimilarArticle } from '../../types';

/** 📰 Article (shape API Go /v1/articles). */
export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  hasUnpublishedChanges?: boolean;
  status: string;
  scheduledAt?: string | null;
  isPremium: boolean;
  readingTime: number;
  categoryId: string | null;
  authorId: string;
  publisherId: string;
  createdAt: string;
  updatedAt: string;
  /** Droit de téléchargement (hors-ligne/file d'écoute) — l'auteur choisit. */
  allowDownload?: boolean;
  /** Autorise les annotations publiques des lecteurs. */
  allowPublicAnnotations?: boolean;
  /** Autorise l'espace commentaires. */
  allowComments?: boolean;
  /** Afficher aussi sur le profil et le blog personnel de l'auteur (cross-post Média → Personnel). */
  showOnPersonalProfile?: boolean;
  /** Souveraineté de l'auteur : identifiant de l'article média d'origine. */
  originArticleId?: string | null;
  /** 'ORIGINAL' | 'MEDIA_ARCHIVE' | 'PERSONAL_FORK' */
  canonicalType?: 'ORIGINAL' | 'MEDIA_ARCHIVE' | 'PERSONAL_FORK' | string;
  /** true s'il s'agit de l'exemplaire souverain personnel de l'auteur. */
  isAuthorSovereignCopy?: boolean;
  /** URL canonique pointant vers l'origine (SEO). */
  canonicalUrl?: string | null;
  /** Éditeur/Média d'origine si l'article est un fork souverain. */
  originPublisher?: {
    id: string;
    name: string;
    slug: string;
    subdomain?: string | null;
    logoUrl?: string | null;
    customDomain?: string | null;
    type?: string;
  } | null;
  /** ID de la copie personnelle existante si cet article média a déjà été forké par l'auteur. */
  sovereignCopyId?: string | null;
  /** Indique si l'utilisateur courant peut toujours modifier cet article. */
  canEdit?: boolean;
  /** Publisher dénormalisée de l'article. */
  publisher?: {
    id: string;
    name: string;
    slug: string;
    subdomain?: string | null;
    logoUrl?: string | null;
    type?: 'PERSONAL' | 'MEDIA' | string;
  } | null;
  /** Image de couverture de l'article (null = repli sur celle de la publication). */
  imageUrl?: string | null;
  /** Titre SEO alternatif (fallback : title). */
  seoTitle?: string | null;
  /** Description SEO (fallback : teaser public zéro-fuite). */
  seoDescription?: string | null;
  /** Nombre total de likes (compteur à vie). */
  likesCount?: number;
  /** Nombre total de reposts (compteur à vie). */
  repostsCount?: number;
  /** Statut de distribution par email (Substack-like). */
  emailStatus?: 'NOT_SENT' | 'SENDING' | 'SENT' | 'FAILED' | null;
  emailSentAt?: string | null;
  emailSentCount?: number;
  emailResendCount?: number;
}

/** 📥 Bascule le droit de téléchargement (hors-ligne + file d'écoute).
 * Même garde qu'édition côté Go (auteur/média/co-auteur). Effet immédiat. */
export const setArticleAllowDownloadAction = safeAction<
  { articleId: string; allowDownload: boolean },
  { id: string; allowDownload: boolean }
>(async ({ articleId, allowDownload }) => {
  return goFetch<{ id: string; allowDownload: boolean }>(
    `/v1/articles/${encodeURIComponent(articleId)}/download`,
    { method: 'PATCH', body: { allowDownload } }
  );
});

/** 🗂️ Catégorie (shape API Go /v1/categories). */
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  publisherId: string;
  parentId: string | null;
  /** Catégorie technique « Non classé », non supprimable et masquée de la nav. */
  isDefault?: boolean;
}

export type ArticleListPayload = Array<
  Article & {
    category: Category | null;
    views: number;
    viewsUnique: number;
    commentsCount: number;
  }
>;

async function authenticateUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

/**
 * 🎛️ Publication active — délègue au résolveur unique `actions/workspace`.
 * Conservé à l'export pour les actions historiques (recommandations, etc.).
 */
export async function getActivePublisherId(): Promise<string> {
  return resolveActivePublisherId();
}

export const getArticlesAction = safeAction<string | void, ArticleListPayload>(async (period) => {
  const workspace = await getActiveWorkspaceContext();
  const p = typeof period === 'string' && period ? period : '30d';
  // workspaceType=PERSONAL inclut les articles co-signés (attribution
  // acceptée + visible), pas seulement ceux de la publication personnelle.
  return goFetch<ArticleListPayload>(
    `/v1/articles?publisherId=${encodeURIComponent(workspace.publisherId)}&workspaceType=${workspace.type}&period=${encodeURIComponent(p)}`
  );
});

export interface ArticleAuthorBrief {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
  /** Identité publique de l'article, dérivée de sa publication. */
  type?: 'PERSONAL' | 'MEDIA' | string;
}

export interface ArticleReviewFeedback {
  id: string;
  articleId: string;
  action: string;
  comment?: string | null;
  createdAt: string;
  reviewerName?: string | null;
  reviewerUsername?: string | null;
  reviewerLogo?: string | null;
}

export interface ArticleEditorPayload extends Article {
  liveContent?: string | null;
  draftContent?: string | null;
  reviewFeedback?: ArticleReviewFeedback | null;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  category: Category | null;
  publisher?: {
    id: string;
    name: string;
    slug: string;
    subdomain?: string | null;
    type?: 'PERSONAL' | 'MEDIA' | string;
  } | null;
  author: ArticleAuthorBrief;
  coAuthors: ArticleAuthorBrief[];
  attributions: Array<{
    role: string;
    order: number;
    isVisible: boolean;
    consentStatus?: string;
    user: ArticleAuthorBrief;
  }>;
  views: number;
  viewsUnique: number;
  commentsCount: number;
}

/** Entrée de la chronologie de publication d'un article (append-only). */
export type ArticleEventType =
  | 'CREATED'
  | 'PUBLISHED'
  | 'LIVE_UPDATED'
  | 'UNPUBLISHED'
  | 'SCHEDULED'
  | 'RESCHEDULED'
  | 'SCHEDULE_CANCELLED'
  | 'SCHEDULED_PUBLISHED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED';

export interface ArticleEvent {
  id: string;
  type: ArticleEventType;
  fromStatus?: string;
  toStatus?: string;
  scheduledAt?: string | null;
  actorId?: string;
  actorName?: string;
  actorUsername?: string;
  createdAt: string;
}

/**
 * 📜 Historique de publication d'un article, le plus récent d'abord.
 * Même visibilité que l'édition (auteur, média autorisé, co-auteur).
 */
export const getArticleEventsAction = safeAction<string, ArticleEvent[]>(async (articleId) => {
  return goFetch<ArticleEvent[]>(`/v1/articles/${encodeURIComponent(articleId)}/events`);
});

export const getArticleByIdAction = safeAction<string, ArticleEditorPayload | null>(async (id) => {
  // ✅ Go-only : l'auth (auteur / membre de la publication) est vérifiée côté Go.
  try {
    return await goFetch<ArticleEditorPayload>(`/v1/articles/by-id/${id}`);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
});

export interface BulkUpdateArticlesInput {
  ids: string[];
  isPremium?: boolean;
  setCategory?: boolean;
  categoryId?: string | null;
  allowPublicAnnotations?: boolean;
  allowComments?: boolean;
  allowDownload?: boolean;
  showOnPersonalProfile?: boolean;
  published?: boolean;
}

/** 🧩 Réglages/publication en masse, sans contenu ni édition complète. */
export const bulkUpdateArticlesAction = safeAction<
  BulkUpdateArticlesInput,
  { updated: number; failed: string[] }
>(async (input) => {
  const res = await goFetch<{ updated: number; failed: string[] }>('/v1/articles/bulk', {
    method: 'PATCH',
    body: input,
  });
  revalidatePath('/articles');
  return res;
});

export interface ArticleWorkspaceItem {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  type: 'PERSONAL' | 'MEDIA';
  role?: string;
}

/** 🏢 Liste le profil personnel et les médias accessibles à l'utilisateur. */
export const getWorkspacesAction = safeAction<
  void,
  { personal: ArticleWorkspaceItem; medias: ArticleWorkspaceItem[] }
>(async () => {
  await authenticateUser();
  return goFetch<{ personal: ArticleWorkspaceItem; medias: ArticleWorkspaceItem[] }>(
    '/v1/media/workspaces'
  );
});

export interface TransferArticleInput {
  articleId: string;
  targetPublisherId: string;
  targetCategoryId?: string | null;
  showOnPersonalProfile?: boolean;
}

/** 🔀 Transfère un article vers une autre publication (Personnel ↔ Média). */
export const transferArticleAction = safeAction<TransferArticleInput, ArticleEditorPayload>(
  async ({ articleId, targetPublisherId, targetCategoryId, showOnPersonalProfile }) => {
    await authenticateUser();
    const res = await goFetch<ArticleEditorPayload>(
      `/v1/articles/${encodeURIComponent(articleId)}/transfer`,
      {
        method: 'POST',
        body: {
          targetPublisherId,
          ...(targetCategoryId !== undefined ? { targetCategoryId } : {}),
          ...(showOnPersonalProfile !== undefined ? { showOnPersonalProfile } : {}),
        },
      }
    );
    revalidatePath('/articles');
    revalidatePath(`/articles/${articleId}`);
    return res;
  }
);

/** 🛡️ Clone ou récupère l'exemplaire souverain personnel d'un essai écrit dans un média. */
export const forkArticleToPersonalAction = safeAction<
  { articleId: string },
  { id: string; alreadyExisted: boolean }
>(async ({ articleId }) => {
  await authenticateUser();
  const res = await goFetch<{ id: string; alreadyExisted: boolean }>(
    `/v1/articles/${encodeURIComponent(articleId)}/fork-personal`,
    { method: 'POST' }
  );
  revalidatePath('/articles');
  return res;
});

/** 📤 Soumet le texte modifié de l'essai personnel comme révision à l'article média d'origine. */
export const submitRevisionToOriginAction = safeAction<
  { articleId: string },
  { originArticleId: string; status: string }
>(async ({ articleId }) => {
  await authenticateUser();
  const res = await goFetch<{ originArticleId: string; status: string }>(
    `/v1/articles/${encodeURIComponent(articleId)}/submit-revision`,
    { method: 'POST' }
  );
  revalidatePath('/articles');
  revalidatePath(`/articles/${articleId}`);
  return res;
});

export const saveArticleAction = safeAction<
  {
    id?: string;
    publisherId?: string;
    title: string;
    content: string;
    imageUrl?: string | null;
    slug?: string;
    published?: boolean;
    status?: string;
    scheduledAt?: string | null;
    isPremium?: boolean;
    allowPublicAnnotations?: boolean;
    allowComments?: boolean;
    allowDownload?: boolean;
    showOnPersonalProfile?: boolean;
    categoryId?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    attributions?: ArticleAttributionInput[];
    sendEmail?: boolean;
    emailSubject?: string;
    emailPreviewText?: string;
  },
  Article
>(async (data) => {
  const user = await authenticateUser();
  const {
    id,
    publisherId: requestedPublisherId,
    title,
    content,
    imageUrl = null,
    slug,
    published = false,
    status,
    scheduledAt = null,
    isPremium = false,
    allowPublicAnnotations,
    allowComments,
    allowDownload,
    showOnPersonalProfile,
    categoryId = null,
    seoTitle = null,
    seoDescription = null,
    attributions,
    sendEmail,
    emailSubject,
    emailPreviewText,
  } = data;

  if (!title.trim()) {
    throw new Error("Le titre de l'article est requis.");
  }

  let finalSlug = slugify(slug || title);
  if (!finalSlug) {
    finalSlug = `article-${shortId()}`;
  }

  const wordCount = content
    .replace(/<[^>]*>/g, '')
    .split(/\s+/)
    .filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  // ✅ Go-only : le Go gère RBAC média, attributions, workflow et slug unique.
  if (id) {
    const activePublisherId = requestedPublisherId || (await getActivePublisherId());
    return goFetch<Article>(`/v1/articles/${id}`, {
      method: 'PATCH',
      body: {
        title,
        content,
        imageUrl,
        slug: finalSlug,
        published,
        status,
        scheduledAt,
        isPremium,
        allowPublicAnnotations,
        allowComments,
        allowDownload,
        showOnPersonalProfile,
        categoryId,
        seoTitle,
        seoDescription,
        readingTime,
        attributions: normalizeArticleAttributions(attributions, user.id),
        activePublisherId,
        sendEmail,
        emailSubject,
        emailPreviewText,
      },
    });
  }
  const publisherId = requestedPublisherId || (await getActivePublisherId());
  return goFetch<Article>(`/v1/articles`, {
    method: 'POST',
    body: {
      publisherId,
      title,
      content,
      imageUrl,
      slug: finalSlug,
      published,
      status,
      scheduledAt,
      isPremium,
      allowPublicAnnotations,
      allowComments,
      allowDownload,
      showOnPersonalProfile,
      categoryId,
      seoTitle,
      seoDescription,
      readingTime,
      attributions: normalizeArticleAttributions(attributions, user.id),
      sendEmail,
      emailSubject,
      emailPreviewText,
    },
  });
});

/** ✉️ Déclenche manuellement l'envoi newsletter pour un article publié. */
export const sendArticleEmailAction = safeAction<
  {
    articleId: string;
    subject?: string;
    previewText?: string;
    isMajorUpdate?: boolean;
  },
  { ok: boolean }
>(async ({ articleId, subject, previewText, isMajorUpdate }) => {
  await authenticateUser();
  const res = await goFetch<{ ok: boolean }>(
    `/v1/articles/${encodeURIComponent(articleId)}/send-email`,
    {
      method: 'POST',
      body: { subject, previewText, isMajorUpdate },
    }
  );
  revalidatePath('/articles');
  revalidatePath('/newsletters');
  return res;
});

/** ✉️ Envoie un email de test de l'article à l'adresse de l'utilisateur connecté. */
export const sendArticleTestEmailAction = safeAction<
  { articleId: string },
  { ok: boolean; message: string }
>(async ({ articleId }) => {
  await authenticateUser();
  return goFetch<{ ok: boolean; message: string }>(
    `/v1/articles/${encodeURIComponent(articleId)}/test-email`,
    {
      method: 'POST',
      body: {},
    }
  );
});

/**
 * 📅 Programme (ou annule) la publication d'un article. Date future → statut
 * SCHEDULED (publié automatiquement par le worker) ; null → retour au brouillon.
 */
export const scheduleArticleAction = safeAction<
  { id: string; scheduledAt?: string | null },
  { scheduled: boolean; scheduledAt: string | null }
>(async ({ id, scheduledAt = null }) => {
  const res = await goFetch<{ scheduled: boolean; scheduledAt: string | null }>(
    `/v1/articles/${encodeURIComponent(id)}/schedule`,
    { method: 'POST', body: { scheduledAt } }
  );
  revalidatePath('/articles');
  return res;
});

/**
 * 🔒 Dépublie un article (published=false, status=DRAFT) et efface la
 * programmation. Route dédiée : un PATCH de contenu ne suffit pas, le Go
 * protège l'article en ligne et isole les modifications dans draftContent.
 */
export const unpublishArticleAction = safeAction<string, { published: boolean }>(async (id) => {
  const res = await goFetch<{ published: boolean }>(
    `/v1/articles/${encodeURIComponent(id)}/unpublish`,
    { method: 'POST' }
  );
  revalidatePath('/articles');
  return res;
});

export const searchArticleContributorsAction = safeAction<
  { query: string; excludeIds?: string[] },
  Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  }>
>(async ({ query, excludeIds = [] }) => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  // Go-only : recherche insensible via ILIKE, déléguée à Go.
  const qs = new URLSearchParams({ q: normalizedQuery });
  if (excludeIds.length > 0) qs.set('excludeIds', excludeIds.join(','));
  return await goFetch<ArticleAuthorBrief[]>(`/v1/users/search?${qs.toString()}`);
});

export const deleteArticleAction = safeAction<string, { success: boolean }>(async (id) => {
  const activePublisherId = await getActivePublisherId();
  await goFetch(`/v1/articles/${id}?activePublisherId=${encodeURIComponent(activePublisherId)}`, {
    method: 'DELETE',
  });
  revalidatePath('/articles');
  return { success: true };
});

/**
 * 📋 Approuver ou rejeter un article soumis pour revue (workflow média).
 * RBAC : media:review.
 */
export const reviewArticleAction = safeAction<
  { id: string; approve: boolean; comment?: string },
  Article
>(async (data) => {
  const res = await goFetch<Article>(`/v1/articles/${data.id}/review`, {
    method: 'POST',
    body: { approve: data.approve, comment: data.comment || '' },
  });
  revalidatePath('/articles');
  return res;
});

/**
 * 🗑️ Abandonne le brouillon en cours pour revenir à la version publiée en ligne.
 */
export const discardArticleDraftAction = safeAction<{ id: string }, Article>(async ({ id }) => {
  const res = await goFetch<Article>(`/v1/articles/${id}/discard-draft`, {
    method: 'POST',
  });
  revalidatePath('/articles');
  return res;
});

/**
 * 💬 Récupère le dernier retour éditorial sur l'article (si rejeté ou revu).
 */
export const getArticleReviewFeedbackAction = safeAction<
  { id: string },
  ArticleReviewFeedback | null
>(async ({ id }) => {
  try {
    const res = await goFetch<ArticleReviewFeedback | { feedback: null }>(
      `/v1/articles/${id}/review-feedback`
    );
    if ('feedback' in res && res.feedback === null) return null;
    return res as ArticleReviewFeedback;
  } catch {
    return null;
  }
});

export type CategoryWithCount = Category & { _count: { articles: number } };

export const getCategoriesAction = safeAction<string | void, CategoryWithCount[]>(
  async (requestedPublisherId) => {
    // Un co-auteur peut éditer un article d'une autre publication : les
    // catégories doivent être celles de l'article, pas celles du workspace actif.
    const publisherId = requestedPublisherId || (await getActivePublisherId());
    const res = await goFetch<{
      data: Array<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        parentId: string | null;
        articlesCount: number;
      }>;
    }>(`/v1/categories?publisherId=${publisherId}`);
    return res.data.map((c) => ({
      id: c.id,
      name: c.name?.trim() || c.slug,
      slug: c.slug,
      description: c.description,
      publisherId,
      parentId: c.parentId ?? null,
      _count: { articles: c.articlesCount },
    }));
  }
);

export interface EditorCapabilities {
  isMedia: boolean;
  canPublish: boolean;
  canSubmit: boolean;
  canReview: boolean;
  role: string | null;
  workspaceName: string | null;
}

/**
 * 🎛️ Capacités d'édition de l'utilisateur dans le workspace actif.
 * Utilisé par l'éditeur pour adapter les actions (Publier vs Soumettre).
 * `articleId` permet à un co-auteur non-membre d'une publication média de
 * récupérer ses droits réels sur l'article qu'il édite.
 */
export const getEditorCapabilitiesAction = safeAction<
  { publisherId?: string; articleId?: string } | void,
  EditorCapabilities
>(async (request) => {
  const publisherId = request?.publisherId || (await getActivePublisherId());
  const qs = new URLSearchParams({ publisherId });
  if (request?.articleId) qs.set('articleId', request.articleId);
  return goFetch<EditorCapabilities>(`/v1/articles/capabilities?${qs.toString()}`);
});

export const saveCategoryAction = safeAction<
  {
    id?: string;
    name: string;
    slug?: string;
    description?: string | null;
    parentId?: string | null;
  },
  Category
>(async (data) => {
  const { id, name, slug, description = null, parentId = null } = data;

  if (!name.trim()) throw new Error('Le nom de la catégorie est requis.');

  if (id) {
    const res = await goFetch<Category>(`/v1/categories/${id}`, {
      method: 'PATCH',
      body: { name, slug, description, parentId },
    });
    revalidatePath('/articles');
    return res;
  }
  const publisherId = await getActivePublisherId();
  const res = await goFetch<Category>(`/v1/categories`, {
    method: 'POST',
    body: { publisherId, name, slug, description, parentId },
  });
  revalidatePath('/articles');
  return res;
});

export const moveCategoryAction = safeAction<{ id: string; parentId: string | null }, Category>(
  async (data) => {
    const { id, parentId } = data;
    const res = await goFetch<Category>(`/v1/categories/${id}`, {
      method: 'PATCH',
      body: { parentId },
    });
    revalidatePath('/articles');
    return res;
  }
);

export const deleteCategoryAction = safeAction<string, { success: boolean }>(async (id) => {
  await goFetch(`/v1/categories/${id}`, { method: 'DELETE' });
  revalidatePath('/articles');
  return { success: true };
});

export interface ArticleCommentPayload {
  id: string;
  content: string;
  parentId: string | null;
  articleId: string;
  author: ArticleAuthorBrief;
  createdAt: string;
}

export const postArticleCommentAction = safeAction<
  { articleId: string; content: string; parentId?: string | null },
  ArticleCommentPayload
>(async (data) => {
  const { articleId, content, parentId } = data;
  // 🔗 Proxy Go : création + notification COMMENT déléguées au backend Go.
  return goFetch<ArticleCommentPayload>(`/v1/articles/${articleId}/comments`, {
    method: 'POST',
    body: { content, parentId: parentId || null },
  });
});

export const deleteArticleCommentAction = safeAction<string, { success: boolean }>(
  async (commentId) => {
    await goFetch<{ success: boolean }>(`/v1/articles/comments/${commentId}`, {
      method: 'DELETE',
    });
    return { success: true };
  }
);

export const getArticleCommentsAction = safeAction<string, ArticleCommentPayload[]>(
  async (articleId) => {
    return goFetch<ArticleCommentPayload[]>(`/v1/articles/${articleId}/comments`);
  },
  { requireAuth: false }
);

/**
 * 🧠 Articles similaires — recommandations sémantiques (pgvector, API Go).
 * Retourne une liste vide tant que le worker d'embedding n'a pas indexé.
 */
export const getSimilarArticlesAction = safeAction<
  { articleId: string; limit?: number },
  SimilarArticle[]
>(
  async ({ articleId, limit = 6 }) => {
    const res = await goFetch<{ items: SimilarArticle[] }>(
      `/v1/articles/${encodeURIComponent(articleId)}/similar?limit=${limit}`
    );
    return (res as { items?: SimilarArticle[] })?.items ?? [];
  },
  { requireAuth: false }
);

// =====================================================================
// 🤝 Collaboration Links & Direct Invitations (API Go /v1/collaborations)
// =====================================================================

export interface CollaborationInviteLinkDTO {
  id: string;
  articleId: string;
  token: string;
  role: string;
  expiresAt: string | null;
  maxUses: number;
  usedCount: number;
  isRevoked: boolean;
  createdAt: string;
}

export interface CollaborationInviteLinkPreview {
  articleId: string;
  title: string;
  slug?: string;
  role: string;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  };
  expiresAt?: string | null;
  maxUses: number;
  usedCount: number;
  isValid: boolean;
  statusText: string;
}

/**
 * 🔗 Générer un lien d'invitation à collaborer sur un article
 */
export const createCollaborationInviteLinkAction = safeAction<
  { articleId: string; role?: string; expiresInHours?: number; maxUses?: number },
  { success: boolean; link: CollaborationInviteLinkDTO }
>(async ({ articleId, role = 'CONTRIBUTOR', expiresInHours = 24, maxUses = 1 }) => {
  return goFetch<{ success: boolean; link: CollaborationInviteLinkDTO }>(
    '/v1/collaborations/links',
    {
      method: 'POST',
      body: { articleId, role, expiresInHours, maxUses },
    }
  );
});

/**
 * 📋 Lister les liens d'invitation actifs d'un article
 */
export const listCollaborationInviteLinksAction = safeAction<
  string,
  { links: CollaborationInviteLinkDTO[] }
>(async (articleId) => {
  return goFetch<{ links: CollaborationInviteLinkDTO[] }>(
    `/v1/collaborations/links/article/${encodeURIComponent(articleId)}`
  );
});

/**
 * 🚫 Révoquer un lien d'invitation d'article
 */
export const revokeCollaborationInviteLinkAction = safeAction<string, { success: boolean }>(
  async (linkId) => {
    return goFetch<{ success: boolean }>(
      `/v1/collaborations/links/${encodeURIComponent(linkId)}/revoke`,
      { method: 'POST' }
    );
  }
);

/**
 * 🔍 Consulter la prévisualisation d'un lien d'invitation d'article
 */
export const getCollaborationInviteLinkPreviewAction = safeAction<
  string,
  CollaborationInviteLinkPreview
>(
  async (token) => {
    return goFetch<CollaborationInviteLinkPreview>(
      `/v1/collaborations/links/${encodeURIComponent(token)}`
    );
  },
  { requireAuth: false }
);

/**
 * 🚀 Accepter et rejoindre la co-rédaction via un lien d'invitation
 */
export const joinCollaborationByLinkAction = safeAction<
  string,
  { success: boolean; articleId: string }
>(async (token) => {
  return goFetch<{ success: boolean; articleId: string }>(
    `/v1/collaborations/links/${encodeURIComponent(token)}/join`,
    { method: 'POST' }
  );
});

/**
 * 👤 Inviter un co-auteur directement par son @username (confidentiel, sans email)
 */
export const inviteCollaboratorByUsernameAction = safeAction<
  { articleId: string; username: string; role?: string },
  { success: boolean; request: unknown }
>(async ({ articleId, username, role = 'CO_AUTHOR' }) => {
  return goFetch<{ success: boolean; request: unknown }>('/v1/collaborations/invite-by-username', {
    method: 'POST',
    body: { articleId, username, role },
  });
});
