import { buildArticlePath } from '@qoe/utils';
import Link from 'next/link';
import { fetchTenantPublication } from '@/lib/tenant-data';

interface RelatedArticlesProps {
  domain: string;
  currentSlug: string;
  categorySlug: string | null;
  categoryName: string | null;
}

export async function RelatedArticles({
  domain,
  currentSlug,
  categorySlug,
  categoryName,
}: RelatedArticlesProps) {
  const publication = await fetchTenantPublication(domain);
  const items = (publication?.articles || []).filter(
    (a) => a.published !== false && a.slug && a.slug !== currentSlug
  );
  if (items.length === 0) return null;

  const sameCategory = categorySlug
    ? items.filter((a) => a.category?.slug === categorySlug || a.categoryId === categorySlug)
    : [];
  const picks = [...sameCategory, ...items.filter((a) => !sameCategory.includes(a))].slice(0, 3);
  if (picks.length === 0) return null;

  return (
    <section className="mt-14 border-t border-border/40 pt-8">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {sameCategory.length > 0 && categoryName ? `Dans la même rubrique` : `À lire aussi`}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {picks.map((art) => (
          <Link
            key={art.id}
            href={buildArticlePath(art)}
            className="group rounded-lg border border-border p-4 transition-colors hover:border-foreground/30"
          >
            {art.category && (
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                {art.category.name}
              </p>
            )}
            <p className="text-sm font-bold leading-snug group-hover:text-[var(--tenant-accent)]">
              {art.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
