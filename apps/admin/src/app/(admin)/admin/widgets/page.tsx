import { getAdminWidgets } from '@/lib/admin-data';
import { WidgetsCMS } from './components/WidgetsCMS';

export default async function AdminWidgetsPage() {
  // Articles + tendances + promos (Go en primaire, fallback Prisma dev).
  const { articles, trends, promos } = await getAdminWidgets();

  return (
    <div className="w-full space-y-10">
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Widgets & Tendances
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Pilotez les widgets d'accueil de la timeline : l'article mis en avant, la liste des
          tendances et les encarts de partenariats.
        </p>
      </div>

      <WidgetsCMS
        articles={articles.map((a) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          published: a.published,
          isEditorPick: a.isEditorPick,
          createdAt: new Date(a.createdAt),
          author: { name: a.authorName, email: a.authorEmail },
        }))}
        trends={trends.map((t) => ({ id: t.id, hashtag: t.hashtag, count: t.count }))}
        promos={promos.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          ctaText: p.ctaText,
          ctaUrl: p.ctaUrl,
          imageUrl: p.imageUrl,
          isActive: p.isActive,
        }))}
      />
    </div>
  );
}
