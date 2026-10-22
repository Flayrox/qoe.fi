export interface ArticleWithCategory {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  status?: string;
  isPremium: boolean;
  readingTime: number;
  categoryId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  _count?: {
    bookmarks: number;
    highlights: number;
    letters: number;
  };
  views?: number;
  viewsUnique?: number;
  commentsCount?: number;
  likesCount?: number;
  repostsCount?: number;
  allowPublicAnnotations?: boolean;
  allowComments?: boolean;
  allowDownload?: boolean;
}

export interface CategoryWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  isDefault?: boolean;
  _count: {
    articles: number;
  };
}

export type SortField =
  'updatedAt' | 'createdAt' | 'title' | 'readingTime' | 'likes' | 'reposts' | 'engagement';
export type SortDirection = 'desc' | 'asc';
export type AccessFilter = 'all' | 'free' | 'premium';
export type StatusFilter = 'all' | 'published' | 'draft' | 'review';
export type Density = 'comfortable' | 'compact';

export interface ListColumnPrefs {
  category: boolean;
  status: boolean;
  premium: boolean;
  updatedAt: boolean;
  views: boolean;
  comments: boolean;
}

export interface SavedListView {
  sortField: SortField;
  sortDirection: SortDirection;
  selectedCategory: string;
  accessFilter: AccessFilter;
  statusFilter: StatusFilter;
  density: Density;
  columns: ListColumnPrefs;
}
