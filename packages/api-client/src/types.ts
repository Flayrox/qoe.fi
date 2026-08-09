export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta?: {
    page?: number;
    cursor?: string | null;
    hasMore?: boolean;
    total?: number;
  };
};

export interface ThoughtData {
  id: string;
  content: string;
  authorId: string;
  author: {
    id: string;
    username: string | null;
    name: string | null;
    subdomain: string | null;
  };
  createdAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  isLiked?: boolean;
  isReposted?: boolean;
}
