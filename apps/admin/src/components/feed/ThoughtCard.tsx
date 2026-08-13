// Stub minimal
interface ThoughtAuthor {
  id: string;
  name: string | null;
  username: string | null;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified?: boolean;
}

interface Thought {
  id: string;
  content: string;
  author: ThoughtAuthor | null;
  createdAt: Date | string;
  imageUrl?: string | null;
  tags?: string[];
  _count?: { likes: number; replies: number; reposts: number };
  title?: string;
  slug?: string;
  published?: boolean;
  isPremium?: boolean;
  readingTime?: number;
  category?: { name: string } | null;
  likesCount?: number;
  repliesCount?: number;
  liked?: boolean;
}

export function ThoughtCard({ post, isPreview }: { post: Thought; isPreview?: boolean }) {
  return (
    <div className="p-4 border border-border/40 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          {post.author?.name?.[0] || '?'}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{post.author?.name || 'Anonyme'}</span>
          </div>
          <p className="text-sm mt-1">{post.content}</p>
          {isPreview && (
            <p className="text-xs text-primary mt-2">Aperçu - Inscrivez-vous pour voir plus</p>
          )}
        </div>
      </div>
    </div>
  );
}
