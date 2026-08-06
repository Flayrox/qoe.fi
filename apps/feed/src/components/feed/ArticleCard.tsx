// Stub minimal — sera restauré depuis git history
import Link from "next/link";

interface ArticleAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl?: string | null;
  isCertified?: boolean;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string | null;
  published: boolean;
  isPremium: boolean;
  readingTime: number;
  createdAt: Date | string;
  author: ArticleAuthor;
  category: { name: string } | null;
  tags?: string[];
}

export function ArticleCard({ article, isPreview }: { article: Article; isPreview?: boolean }) {
  return (
    <Link
      href={`/article/${article.slug}`}
      className="block p-4 border border-border/40 rounded-lg hover:bg-muted/50 transition-colors"
    >
      <h3 className="font-semibold">{article.title}</h3>
      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
        {article.content?.replace(/<[^>]*>?/gm, "").substring(0, 150)}
      </p>
      {isPreview && (
        <p className="text-xs text-primary mt-2">Aperçu - Connectez-vous pour la suite</p>
      )}
    </Link>
  );
}
