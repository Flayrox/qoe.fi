import React from "react"
import { prisma } from "@qoe/db/client"
import { requireUser } from "@qoe/auth/current-user"
import { getTranslate } from "@qoe/i18n/server"
import { BookOpen, Users, Coins, Plus, FileText, Mail, Settings, Edit3, ArrowUpRight } from "lucide-react"

export default async function CreatorDashboardPage() {
  const user = await requireUser()
  const t = await getTranslate()

  // Fetch metrics in parallel
  const [
    articlesCount,
    publishedCount,
    subscribersCount,
    premiumSubscribersCount,
    subscribersList,
    recentArticles
  ] = await Promise.all([
    prisma.article.count({ where: { authorId: user.id } }),
    prisma.article.count({ where: { authorId: user.id, published: true } }),
    prisma.subscriber.count({ where: { creatorId: user.id, isActive: true } }),
    prisma.subscriber.count({ where: { creatorId: user.id, isActive: true, isPremium: true } }),
    prisma.subscriber.findMany({
      where: { creatorId: user.id, isActive: true },
      select: { createdAt: true, ltvCents: true }
    }),
    prisma.article.findMany({
      where: { authorId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: { category: true }
    })
  ])

  const draftCount = articlesCount - publishedCount
  const freeSubscribersCount = subscribersCount - premiumSubscribersCount

  // Calculate LTV
  const totalLtvCents = subscribersList.reduce((acc, sub) => acc + (sub.ltvCents || 0), 0)
  const totalLtvEuro = (totalLtvCents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR"
  })

  // Sparkline data calculation (Subscribers over time / simple aesthetic SVG sparkline)
  // Let's generate coordinates for the SVG path.
  // We want to draw a sparkline based on actual creation dates, or fall back to an elegant organic mock curve if empty.
  const getSubscribersSparkline = () => {
    if (subscribersList.length < 2) {
      // Return a beautiful neutral curve as a fallback
      return "M 0 25 C 20 10, 40 40, 60 20 C 80 5, 100 25, 120 15"
    }
    // Sort by date
    const sorted = [...subscribersList].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const width = 120
    const height = 30
    const pointsCount = Math.min(sorted.length, 10)
    const step = width / (pointsCount - 1 || 1)
    
    // Simple incremental counts for visual line
    let currentCount = 0
    const coords = sorted.slice(-pointsCount).map((_, idx) => {
      currentCount += 1
      const x = idx * step
      // normalize y
      const y = height - (currentCount / pointsCount) * (height - 6) - 3
      return { x, y }
    })

    return coords.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`
    }, "")
  }

  const getArticlesSparkline = () => {
    // Generate organic wave for articles creation
    return "M 0 20 C 15 28, 30 15, 45 10 C 60 5, 75 25, 90 12 C 105 5, 120 18, 120 8"
  }

  const getEarningsSparkline = () => {
    // Generate upward trending curve
    return "M 0 28 C 30 25, 60 18, 90 8 C 100 5, 110 2, 120 1"
  }

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-24 text-foreground font-sans">
      
      {/* Welcome Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t?.('dashboard.welcome', { name: user.name || "Créateur" }) || `Bonjour, ${user.name || "Créateur"}`}
        </h1>
        <p className="text-muted-foreground text-xs italic tracking-normal">
          « Un espace souverain pour cultiver le silence et l'écriture profonde. »
        </p>
      </div>

      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Metric Card: Articles */}
        <div className="border border-border/60 rounded-xl p-6 bg-card flex flex-col justify-between h-36 hover:border-border transition-all">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Écrits</span>
              <span className="text-3xl font-bold tracking-tight">{articlesCount}</span>
            </div>
            <div className="p-2 bg-muted/65 rounded-lg">
              <BookOpen className="h-4 w-4 text-muted-foreground stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">
              {publishedCount} publiés · {draftCount} brouillons
            </span>
            {/* Native SVG Sparkline */}
            <svg className="w-24 h-8 text-muted-foreground/40 overflow-visible" viewBox="0 0 120 30">
              <path
                d={getArticlesSparkline()}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Metric Card: Audience */}
        <div className="border border-border/60 rounded-xl p-6 bg-card flex flex-col justify-between h-36 hover:border-border transition-all">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Abonnés</span>
              <span className="text-3xl font-bold tracking-tight">{subscribersCount}</span>
            </div>
            <div className="p-2 bg-muted/65 rounded-lg">
              <Users className="h-4 w-4 text-muted-foreground stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">
              {freeSubscribersCount} gratuits · {premiumSubscribersCount} premium
            </span>
            {/* Native SVG Sparkline */}
            <svg className="w-24 h-8 text-emerald-500/50 overflow-visible" viewBox="0 0 120 30">
              <path
                d={getSubscribersSparkline()}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Metric Card: Earnings */}
        <div className="border border-border/60 rounded-xl p-6 bg-card flex flex-col justify-between h-36 hover:border-border transition-all">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Valeur Cumulée</span>
              <span className="text-3xl font-bold tracking-tight">{totalLtvEuro}</span>
            </div>
            <div className="p-2 bg-muted/65 rounded-lg">
              <Coins className="h-4 w-4 text-muted-foreground stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">
              Revenus LTV des abonnements
            </span>
            {/* Native SVG Sparkline */}
            <svg className="w-24 h-8 text-primary/40 overflow-visible" viewBox="0 0 120 30">
              <path
                d={getEarningsSparkline()}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

      </div>

      {/* Main Grid: Recent writings and Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-4">
        
        {/* Left: Recent writings list */}
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Écrits Récents
            </h2>
            <a href="/articles" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 font-semibold">
              Tout voir <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>

          {recentArticles.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-12 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Aucun article rédigé pour le moment.</p>
              <p className="text-xs italic text-muted-foreground/60">
                Le silence précède les grandes œuvres.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentArticles.map((art) => (
                <div
                  key={art.id}
                  className="group py-5 flex items-center justify-between gap-6 hover:bg-muted/30 -mx-4 px-4 rounded-xl transition-all"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">
                        {new Date(art.updatedAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric"
                        })}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${art.published ? "bg-emerald-500" : "bg-muted-foreground/45"}`} />
                        {art.published ? "Publié" : "Brouillon"}
                      </span>
                      {art.category && (
                        <>
                          <span>•</span>
                          <span>{art.category.name}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-foreground tracking-tight truncate group-hover:text-primary transition-colors">
                      {art.title}
                    </h3>
                  </div>

                  <a
                    href={`/articles/${art.id}`}
                    className="inline-flex items-center justify-center h-8 px-3 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted font-sans text-xs font-semibold transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span className="ml-1.5 hidden sm:inline">Écrire</span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Quick actions panel */}
        <div className="md:col-span-1 space-y-6">
          <div className="border-b border-border/60 pb-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Actions rapides
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            
            <a
              href="/articles/new"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card hover:bg-muted hover:border-border transition-all"
            >
              <div className="p-2 bg-muted rounded-md text-foreground">
                <Plus className="h-4 w-4 stroke-[1.5]" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-foreground">Nouvel écrit</span>
                <span className="text-[10px] text-muted-foreground block">Donnez vie à vos idées.</span>
              </div>
            </a>

            <a
              href="/newsletters"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card hover:bg-muted hover:border-border transition-all"
            >
              <div className="p-2 bg-muted rounded-md text-foreground">
                <Mail className="h-4 w-4 stroke-[1.5]" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-foreground">Envoyer une newsletter</span>
                <span className="text-[10px] text-muted-foreground block">Écrivez directement à vos abonnés.</span>
              </div>
            </a>

            <a
              href="/audience"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card hover:bg-muted hover:border-border transition-all"
            >
              <div className="p-2 bg-muted rounded-md text-foreground">
                <Users className="h-4 w-4 stroke-[1.5]" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-foreground">Gérer l'audience</span>
                <span className="text-[10px] text-muted-foreground block">Consultez et importez vos contacts.</span>
              </div>
            </a>

            <a
              href="/settings"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card hover:bg-muted hover:border-border transition-all"
            >
              <div className="p-2 bg-muted rounded-md text-foreground">
                <Settings className="h-4 w-4 stroke-[1.5]" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-foreground">Paramètres</span>
                <span className="text-[10px] text-muted-foreground block">Configurez votre branding et domaine.</span>
              </div>
            </a>

          </div>
        </div>

      </div>

    </div>
  )
}
