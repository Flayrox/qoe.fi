// =====================================================================
// 🔌 Universal HTTP Client — @qoe/api-client
// =====================================================================
// 📖 Compatible avec le Web, Node.js et React Native / Mobile (Expo).
// =====================================================================

export interface QoeApiClientConfig {
  baseUrl?: string;
  getAuthToken?: () => string | Promise<string | null> | null;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export class QoeApiClient {
  private baseUrl: string;
  private getAuthToken?: () => string | Promise<string | null> | null;

  constructor(config?: QoeApiClientConfig) {
    this.baseUrl = config?.baseUrl || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3002");
    this.getAuthToken = config?.getAuthToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };

      if (this.getAuthToken) {
        const token = await this.getAuthToken();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }

      const url = `${this.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          ok: false,
          error: json.error || json.message || `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
        };
      }

      return {
        ok: true,
        data: json.data !== undefined ? json.data : json,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err.message || "Network Error",
      };
    }
  }

  // ─── Feed & Content ──────────────────────────────────────────
  public async getFeed(params?: { cursor?: string; limit?: number; tab?: "for_you" | "following" | "discover" }) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.tab) query.set("tab", params.tab);

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return this.request<{ items: any[]; nextCursor: string | null }>(`/v1/feed${queryString}`);
  }

  public async createThought(content: string, options?: { imageUrl?: string; triggerWarning?: string; visibility?: "public" | "followers" }) {
    return this.request<any>("/v1/thoughts", {
      method: "POST",
      body: JSON.stringify({ content, ...options }),
    });
  }

  public async toggleLike(postId: string) {
    return this.request<{ liked: boolean; likesCount: number }>(`/v1/thoughts/${postId}/like`, {
      method: "POST",
    });
  }

  public async toggleRepost(postId: string) {
    return this.request<{ reposted: boolean; repostsCount: number }>(`/v1/thoughts/${postId}/repost`, {
      method: "POST",
    });
  }

  public async toggleBookmark(targetId: string, targetType: "thought" | "article" = "thought") {
    return this.request<{ bookmarked: boolean }>(`/v1/thoughts/${targetId}/bookmark`, {
      method: "POST",
      body: JSON.stringify({ targetType }),
    });
  }

  // ─── User Profile & Follows ─────────────────────────────────
  public async getMyProfile() {
    return this.request<any>("/v1/users/me");
  }

  public async getUserProfile(username: string) {
    return this.request<any>(`/v1/users/${username}`);
  }

  public async toggleFollowUser(userId: string) {
    return this.request<{ following: boolean; followersCount: number }>(`/v1/users/${userId}/follow`, {
      method: "POST",
    });
  }
}

export function createQoeApiClient(config?: QoeApiClientConfig) {
  return new QoeApiClient(config);
}
