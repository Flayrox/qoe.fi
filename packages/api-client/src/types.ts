export type ApiResponse<T> = {
  success?: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta: {
    page?: number;
    cursor: string | null;
    hasMore: boolean;
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
    customDomain?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  };
  createdAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  liked?: boolean;
  isLiked?: boolean;
  reposted?: boolean;
  isReposted?: boolean;
  triggerWarning?: string | null;
  imageUrl?: string | null;
}
