import { prisma } from "@qoe/db/client"
import { WidgetsCMS } from "./components/WidgetsCMS"

export default async function AdminWidgetsPage() {
  // Fetch published articles to allow editing of "Editor's Pick" (Featured)
  const articles = await prisma.article.findMany({
    include: {
      author: { select: { name: true, email: true } }
    },
    orderBy: { createdAt: "desc" }
  })

  // Fetch all trends
  const trends = await prisma.trend.findMany({
    orderBy: { count: "desc" }
  })

  // Fetch all partner promos
  const promos = await prisma.partnerPromo.findMany({
    orderBy: { createdAt: "desc" }
  })

  return (
    <div className="w-full space-y-10">
      <div className="border-b border-neutral-100 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Widgets & Tendances</h1>
        <p className="text-neutral-500 mt-2 text-sm">
          Pilotez les widgets d'accueil de la timeline : l'article mis en avant, la liste des tendances et les encarts de partenariats.
        </p>
      </div>

      <WidgetsCMS
        articles={articles}
        trends={trends}
        promos={promos}
      />
    </div>
  )
}
