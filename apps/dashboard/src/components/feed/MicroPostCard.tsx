// Stub minimal
import Link from "next/link";

interface PostAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl?: string | null;
  isCertified?: boolean;
}

interface Post {
  id: string;
  content: string;
  imageUrl?: string | null;
  author: PostAuthor;
  createdAt: Date | string;
  tags?: string[];
  _count?: { likes: number; replies: number; reposts: number };
}

export function MicroPostCard({ post, isPreview }: { post: Post; isPreview?: boolean }) {
  return (
    <div className="p-4 border border-border/40 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          {post.author?.name?.[0] || "?"}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{post.author?.name || "Anonyme"}</span>
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
