// =====================================================================
// 🔌 Universal HTTP Client — @qoe/sdk
// =====================================================================
// 📖 Compatible avec le Web, Node.js et React Native / Mobile (Expo).
// ⚠️ Utilisé principalement par le mobile (apps/mobile) pour appeler
//    directement l'API Go (apps/api). L'enveloppe `{data: …}` du Go est
//    dépliée automatiquement : on lit toujours `res.data.<champ>`.
//    Les shapes exactes sont documentées dans docs/API_CONTRACT.md.
// =====================================================================

import type {
  AnnotationComment,
  ArticleData,
  ArticleFeedResult,
  BookmarkItem,
  EngagementPage,
  FeedPoll,
  FeedResult,
  FollowPage,
  Highlight,
  MyHighlight,
  MyProfileData,
  NotificationResult,
  PublicProfileData,
  QuotesPage,
  SimilarArticlesResult,
  Thought,
  ThreadData,
} from './types';

export interface QoeApiClientConfig {
  baseUrl?: string;
  getAuthToken?: () => string | Promise<string | null> | null;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export class QoeApiClient {
  private baseUrl: string;
  private getAuthToken?: () => string | Promise<string | null> | null;

  constructor(config?: QoeApiClientConfig) {
    this.baseUrl =
      config?.baseUrl ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');
    this.getAuthToken = config?.getAuthToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
    // Réessaie uniquement les lectures (GET/HEAD), idempotentes : une erreur
    // réseau transitoire, un 429 (rate-limit) ou un 5xx ne doit pas casser
    // tout un écran — on retente avec un backoff exponentiel.
    const method = (options.method ?? 'GET').toUpperCase();
    const retryable = method === 'GET' || method === 'HEAD';
    const maxAttempts = retryable ? 3 : 1;

    let lastError = '';
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(options.headers as Record<string, string>),
        };

        if (this.getAuthToken) {
          const token = await this.getAuthToken();
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        }

        const url = `${this.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
        const response = await fetch(url, {
          ...options,
          headers,
        });

        const json = await response.json().catch(() => ({}));

        if (!response.ok) {
          lastStatus = response.status;
          lastError =
            json.error || json.message || `HTTP ${response.status}: ${response.statusText}`;
          if (retryable && (response.status === 429 || response.status >= 500)) {
            continue;
          }
          return {
            ok: false,
            error: lastError,
            status: response.status,
          };
        }

        return {
          ok: true,
          data: json.data !== undefined ? json.data : json,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : 'Network Error';
        if (retryable) {
          continue;
        }
        return {
          ok: false,
          error: lastError,
        };
      }
    }

    return {
      ok: false,
      error: lastError || 'Network Error',
      status: lastStatus,
    };
  }

  // ─── Feed & Content ──────────────────────────────────────────
  /**
   * GET /v1/feed — feed des publications suivies (pagination par offset).
   * ⚠️ Renvoie des `FeedSlice` (targetPost imbriqué), PAS des ThoughtData.
   *    Le param `tab` est ignoré par l'API Go.
   */
  public async getFeed(params?: {
    cursor?: string;
    limit?: number;
    tab?: 'for_you' | 'following' | 'discover';
  }) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.tab) query.set('tab', params.tab);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request<FeedResult>(`/v1/feed${queryString}`);
  }

  /**
   * GET /v1/feed/trending — pensées les plus engagées des 7 derniers jours.
   */
  public async getTrendingFeed(params?: { cursor?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request<FeedResult>(`/v1/feed/trending${queryString}`);
  }

  /**
   * GET /v1/feed/articles — articles publiés récents (feed mobile, écran
   * principal). Paginé par offset. ⚠️ Renvoie des `FeedArticle` (miroir
   * ArticleCard web), PAS des FeedSlice.
   */
  public async getFeedArticles(params?: { cursor?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request<ArticleFeedResult>(`/v1/feed/articles${queryString}`);
  }

  /**
   * GET /v1/posts/{id}/thread — fil complet (pensée + réponses).
   * Réponse : `{ post: ThreadData }`.
   */
  public async getThread(postId: string) {
    return this.request<{ post: ThreadData }>(`/v1/posts/${encodeURIComponent(postId)}/thread`);
  }

  /**
   * GET /v1/posts/{id} — lecture d'une pensée (shape `Thought`).
   */
  public async getThought(postId: string) {
    return this.request<Thought>(`/v1/posts/${encodeURIComponent(postId)}`);
  }

  /**
   * POST /v1/posts — créer une pensée (ou une réponse si parentId fourni).
   * Body : { content, tags?, imageUrl?, parentId?, repostId?, replyRestriction? }.
   * ⚠️ `repostId` = CITATION : le post référence une pensée existante avec un
   *    commentaire (contrairement au repost pur qui est vide).
   */
  public async createThought(
    content: string,
    options?: {
      imageUrl?: string;
      triggerWarning?: string;
      visibility?: 'public' | 'followers';
      parentId?: string;
      repostId?: string;
      tags?: string[];
      replyRestriction?: string;
    }
  ) {
    return this.request<Thought>('/v1/posts', {
      method: 'POST',
      body: JSON.stringify({
        content,
        ...(options?.parentId ? { parentId: options.parentId } : {}),
        ...(options?.repostId ? { repostId: options.repostId } : {}),
        ...(options?.tags ? { tags: options.tags } : {}),
        ...(options?.imageUrl ? { imageUrl: options.imageUrl } : {}),
        ...(options?.replyRestriction ? { replyRestriction: options.replyRestriction } : {}),
      }),
    });
  }

  /**
   * POST /v1/posts/{id}/reply — répondre à une pensée (threadgate vérifié côté serveur).
   */
  public async replyToThought(postId: string, content: string) {
    return this.request<Thought>(`/v1/posts/${encodeURIComponent(postId)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  /**
   * GET /v1/posts/{id}/likes — liste paginée des utilisateurs qui ont liké.
   */
  public async getPostLikes(postId: string, params?: { cursor?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor !== undefined) query.set('cursor', params.cursor.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<EngagementPage>(`/v1/posts/${encodeURIComponent(postId)}/likes${qs}`);
  }

  /**
   * GET /v1/posts/{id}/reposts — liste paginée des utilisateurs qui ont
   * reposté (reposts purs).
   */
  public async getPostReposts(postId: string, params?: { cursor?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor !== undefined) query.set('cursor', params.cursor.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<EngagementPage>(`/v1/posts/${encodeURIComponent(postId)}/reposts${qs}`);
  }

  /**
   * GET /v1/posts/{id}/quotes — citations d'un post (posts avec repostId +
   * texte), paginées, en shape FeedPost complète.
   */
  public async getPostQuotes(postId: string, params?: { cursor?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor !== undefined) query.set('cursor', params.cursor.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<QuotesPage>(`/v1/posts/${encodeURIComponent(postId)}/quotes${qs}`);
  }

  /**
   * POST /v1/users/{id}/block — bloque/débloque un utilisateur.
   */
  public async toggleBlockUser(userId: string) {
    return this.request<{ blocked: boolean }>(`/v1/users/${encodeURIComponent(userId)}/block`, {
      method: 'POST',
    });
  }

  /**
   * POST /v1/users/{id}/mute — masque/démasque un utilisateur.
   */
  public async toggleMuteUser(userId: string) {
    return this.request<{ muted: boolean }>(`/v1/users/${encodeURIComponent(userId)}/mute`, {
      method: 'POST',
    });
  }

  /**
   * POST /v1/reports — signale un contenu (thought | article | user | comment).
   */
  public async createReport(data: {
    targetId: string;
    targetType: 'thought' | 'article' | 'user' | 'comment';
    reason: string;
    details?: string;
  }) {
    return this.request<{ success: boolean }>('/v1/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * POST /v1/posts/{id}/like — toggle like. ⚠️ Réponse `{liked}` uniquement
   * (pas de compteur) : dériver le compteur localement.
   */
  public async toggleLike(postId: string) {
    return this.request<{ liked: boolean }>(`/v1/posts/${encodeURIComponent(postId)}/like`, {
      method: 'POST',
    });
  }

  /**
   * POST /v1/posts/{id}/repost — toggle repost. ⚠️ Réponse `{reposted}` uniquement.
   */
  public async toggleRepost(postId: string) {
    return this.request<{ reposted: boolean }>(`/v1/posts/${encodeURIComponent(postId)}/repost`, {
      method: 'POST',
    });
  }

  /**
   * POST /v1/posts/{id}/poll/vote — vote sur un sondage (idempotent,
   * changer d'option remplace le vote). Renvoie le sondage reformaté.
   */
  public async votePoll(postId: string, optionId: string) {
    return this.request<FeedPoll>(`/v1/posts/${encodeURIComponent(postId)}/poll/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    });
  }

  /**
   * POST /v1/posts/{id}/poll/unvote — retire le vote.
   */
  public async unvotePoll(postId: string) {
    return this.request<FeedPoll>(`/v1/posts/${encodeURIComponent(postId)}/poll/unvote`, {
      method: 'POST',
    });
  }

  /**
   * POST /v1/posts/{id}/bookmark — toggle bookmark. ⚠️ Le bookmark Go cible
   * un Article (articleId), pas une pensée.
   */
  public async toggleBookmark(targetId: string, targetType: 'thought' | 'article' = 'thought') {
    return this.request<{ bookmarked: boolean }>(
      `/v1/posts/${encodeURIComponent(targetId)}/bookmark`,
      {
        method: 'POST',
        body: JSON.stringify({ targetType }),
      }
    );
  }

  /**
   * DELETE /v1/posts/{id} — suppression (soft) par l'auteur.
   */
  public async deleteThought(postId: string) {
    return this.request<{ deleted: boolean }>(`/v1/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
    });
  }

  /**
   * POST /v1/posts/{id}/pin — épingle/désépingle sur le profil.
   */
  public async togglePin(postId: string) {
    return this.request<{ pinned: boolean }>(`/v1/posts/${encodeURIComponent(postId)}/pin`, {
      method: 'POST',
    });
  }

  // ─── Search ─────────────────────────────────────────────────
  /** GET /search/articles — recherche publique (Meilisearch). */
  public async searchArticles(query: string) {
    return this.request<{
      hits: Array<{
        id?: string;
        title?: string;
        slug?: string;
        publicationId?: string;
        subdomain?: string;
        [k: string]: unknown;
      }>;
      estimatedTotalHits: number;
    }>(`/search/articles?q=${encodeURIComponent(query)}`);
  }

  // ─── Notifications ────────────────────────────────────────────
  /** GET /v1/notifications — liste paginée (offset via `cursor`). */
  public async getNotifications(params?: { filter?: string; cursor?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.filter) query.set('filter', params.filter);
    if (params?.cursor !== undefined) query.set('cursor', params.cursor.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<NotificationResult>(`/v1/notifications${qs}`);
  }

  /** GET /v1/notifications/unread-count. */
  public async getUnreadNotificationCount() {
    return this.request<{ count: number }>('/v1/notifications/unread-count');
  }

  /** POST /v1/notifications/read — marque des notifications comme lues. */
  public async markNotificationsRead(notificationIds?: string[]) {
    return this.request<{ success: boolean }>('/v1/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ notificationIds: notificationIds ?? [] }),
    });
  }

  /**
   * POST /v1/me/sync — synchronise l'utilisateur Supabase avec la base PostgreSQL.
   */
  public async syncUser() {
    return this.request<{ created: boolean; needsOnboarding: boolean }>('/v1/me/sync', {
      method: 'POST',
    });
  }

  // ─── User Profile & Follows ─────────────────────────────────
  /**
   * GET /v1/users/me — profil courant complet (enveloppé `data`).
   */
  public async getMyProfile() {
    return this.request<MyProfileData>('/v1/users/me');
  }

  /**
   * GET /v1/users/{username} — profil public d'une publication
   * (résolue par slug OU subdomain). ⚠️ `data.id` = publicationId.
   */
  public async getUserProfile(username: string) {
    return this.request<PublicProfileData>(`/v1/users/${encodeURIComponent(username)}`);
  }

  /**
   * GET /v1/users/{username}/articles — articles publiés d'une publication
   * (profil), paginés. Même shape que le feed d'articles.
   */
  public async getProfileArticles(username: string, params?: { cursor?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request<ArticleFeedResult>(
      `/v1/users/${encodeURIComponent(username)}/articles${queryString}`
    );
  }

  /**
   * GET /v1/users/{username}/posts — pensées publiques d'un utilisateur
   * (profil), paginées. ⚠️ Renvoie des `FeedSlice` comme /v1/feed.
   */
  public async getUserPosts(username: string, params?: { cursor?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request<FeedResult>(
      `/v1/users/${encodeURIComponent(username)}/posts${queryString}`
    );
  }

  /**
   * GET /v1/users/{username}/followers — abonnés d'un profil, paginés.
   */
  public async getUserFollowers(username: string, params?: { cursor?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor !== undefined) query.set('cursor', params.cursor.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<FollowPage>(`/v1/users/${encodeURIComponent(username)}/followers${qs}`);
  }

  /**
   * GET /v1/users/{username}/following — abonnements d'un profil, paginés.
   */
  public async getUserFollowing(username: string, params?: { cursor?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor !== undefined) query.set('cursor', params.cursor.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<FollowPage>(`/v1/users/${encodeURIComponent(username)}/following${qs}`);
  }

  /**
   * POST /v1/users/{publicationId}/follow — toggle follow.
   * ⚠️ `id` = publicationId (pas userId). Réponse `{following, followersCount}`.
   */
  public async toggleFollowUser(publicationId: string) {
    return this.request<{ following: boolean; followersCount: number }>(
      `/v1/users/${encodeURIComponent(publicationId)}/follow`,
      {
        method: 'POST',
      }
    );
  }

  // ─── Articles (paywall) ─────────────────────────────────────
  /**
   * GET /v1/articles/{slug}?publicationId= — lecture publique d'un article.
   * ⚠️ `publicationId` REQUIS (sinon 400). Le contenu est tronqué côté
   *    serveur si paywall non débloqué (zéro-fuite).
   */
  public async getArticle(slug: string, publicationId: string) {
    const query = new URLSearchParams({ publicationId });
    return this.request<ArticleData>(
      `/v1/articles/${encodeURIComponent(slug)}?${query.toString()}`
    );
  }

  /**
   * GET /v1/articles/{id}/similar — recommandations sémantiques (pgvector).
   * Retourne une liste vide tant que le worker d'embedding n'a pas indexé.
   */
  public async getSimilarArticles(articleId: string, limit = 6) {
    const query = new URLSearchParams({ limit: limit.toString() });
    return this.request<SimilarArticlesResult>(
      `/v1/articles/${encodeURIComponent(articleId)}/similar?${query.toString()}`
    );
  }

  // ─── Bibliothèque (bookmarks + surlignages) ────────────────
  /**
   * GET /v1/bookmarks — articles sauvegardés du lecteur (bibliothèque), paginés.
   */
  public async getBookmarks(params?: { offset?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.offset) query.set('offset', params.offset.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request<BookmarkItem[]>(`/v1/bookmarks${queryString}`);
  }

  /**
   * GET /v1/me/highlights — mes surlignages (bibliothèque), paginés.
   */
  public async getMyHighlights(params?: { offset?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.offset) query.set('offset', params.offset.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request<MyHighlight[]>(`/v1/me/highlights${queryString}`);
  }

  // ─── Highlights (surlignage d'article) ──────────────────────
  /**
   * GET /v1/articles/{id}/highlights — surlignages d'un article
   * (publics + les siens), avec état upvote du viewer.
   */
  public async getArticleHighlights(articleId: string) {
    return this.request<Highlight[]>(`/v1/articles/${encodeURIComponent(articleId)}/highlights`);
  }

  /**
   * POST /v1/articles/{id}/highlights — crée un surlignage.
   * Body : { text, note?, isPublic? }.
   */
  public async createHighlight(
    articleId: string,
    data: { text: string; note?: string | null; isPublic?: boolean }
  ) {
    return this.request<Highlight>(`/v1/articles/${encodeURIComponent(articleId)}/highlights`, {
      method: 'POST',
      body: JSON.stringify({
        text: data.text,
        note: data.note ?? null,
        isPublic: data.isPublic ?? false,
      }),
    });
  }

  /**
   * DELETE /v1/highlights/{id} — supprime un de ses surlignages.
   */
  public async deleteHighlight(highlightId: string) {
    return this.request<{ success: boolean }>(`/v1/highlights/${encodeURIComponent(highlightId)}`, {
      method: 'DELETE',
    });
  }

  /**
   * POST /v1/highlights/{id}/upvote — toggle upvote d'un surlignage.
   */
  public async toggleHighlightUpvote(highlightId: string) {
    return this.request<{ upvoted: boolean; upvotesCount: number }>(
      `/v1/highlights/${encodeURIComponent(highlightId)}/upvote`,
      { method: 'POST' }
    );
  }

  /**
   * GET /v1/highlights/{id}/comments — commentaires d'un surlignage.
   */
  public async getHighlightComments(highlightId: string) {
    return this.request<AnnotationComment[]>(
      `/v1/highlights/${encodeURIComponent(highlightId)}/comments`
    );
  }

  /**
   * POST /v1/highlights/{id}/comments — ajoute un commentaire d'annotation.
   */
  public async createHighlightComment(highlightId: string, content: string) {
    return this.request<AnnotationComment>(
      `/v1/highlights/${encodeURIComponent(highlightId)}/comments`,
      { method: 'POST', body: JSON.stringify({ content }) }
    );
  }
}

export function createQoeApiClient(config?: QoeApiClientConfig) {
  return new QoeApiClient(config);
}
