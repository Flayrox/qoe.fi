import { findFirstBySlug } from "@qoe/db/repositories/articles";
import { ArticleAnnotatorView } from "@/components/social/ArticleAnnotatorView";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const article = await findFirstBySlug(resolvedParams.slug);

  if (!article) {
    return {
      title: "Article introuvable | qoe.fi",
    };
  }

  return {
    title: `${article.title} | qoe.fi`,
    description: article.content ? article.content.replace(/<[^>]*>?/gm, "").slice(0, 160) : undefined,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const article = await findFirstBySlug(resolvedParams.slug);

  if (!article) {
    notFound();
  }

  return (
    <main className="w-full min-h-screen bg-background">
      <ArticleAnnotatorView article={article} />
    </main>
  );
}
