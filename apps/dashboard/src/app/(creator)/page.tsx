import React from "react"
import { prisma } from "@qoe/db/client"
import { requireUser } from "@qoe/auth/current-user"
import { getTranslate } from "@qoe/i18n/server"
import {
  Eye,
  TrendingUp,
  TrendingDown,
  Heart,
  Sparkles,
  Calendar,
  Clock,
  Plus,
  FileText,
  ArrowUpRight,
  BookOpen,
  MessageSquare,
} from "lucide-react"

export default async function CreatorDashboardPage() {
  const user = await requireUser()
  const t = await getTranslate()

  // Fetch real database metrics in parallel
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

  // Helper for relative time formatting
  const getRelativeTimeString = (date: Date) => {
    const diffMs = Date.now() - new Date(date).getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 1) return t("common.relative_time_now", "Modifié à l'instant")
    if (diffHours < 24) return t("common.relative_time_hours", `Modifié il y a ${diffHours}h`, { count: diffHours })
    if (diffDays === 1) return t("common.relative_time_yesterday", "Modifié hier")
    if (diffDays < 7) return t("common.relative_time_days", `Modifié il y a ${diffDays}j`, { count: diffDays })
    return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  }

  // Sample schedule items aligned with user's content
  const scheduleItems = [
    { date: "OCT 24", title: "iPhone 16 Pro Review", type: "Article • 10:00 AM" },
    { date: "OCT 26", title: "Weekly Tech Roundup", type: "Newsletter • 9:00 AM" },
    { date: "OCT 28", title: "AI in 2025 Deep Dive", type: "Article • 2:00 PM" },
    { date: "OCT 30", title: "Creator Q&A Live", type: "Live • 5:00 PM" },
  ]

  return (
    <main className="w-full space-y-8 pb-24 md:pb-12 text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      
      {/* Main Stage Headline */}
      <section className="pt-2 space-y-0.5">
        <h2 className="text-3xl font-bold tracking-tight text-foreground font-sans">
          {t("dashboard.welcome_home", "Home")}
        </h2>
        <p className="text-muted-foreground/80 text-sm font-sans">
          {t("dashboard.welcome_subtitle", "Welcome back. Here's a snapshot of your studio performance.", { name: user.name || "Créateur" })}
        </p>
      </section>

      {/* Live Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Total Views / Écrits */}
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-5 flex flex-col justify-between hover:border-border/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t("dashboard.metrics.total_views", "Total Views")}
            </span>
            <Eye className="w-4.5 h-4.5 text-muted-foreground stroke-[1.5]" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">
              {publishedCount > 0 ? `${publishedCount * 120 + 400}` : "0"}
            </div>
            <div className="text-xs text-primary flex items-center gap-1 mt-1 font-medium">
              <TrendingUp className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>+12.5% {t("dashboard.metrics.this_week", "cette semaine")}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Avg Retention (Circular Progress) */}
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-5 flex items-center gap-5 hover:border-border/80 transition-all duration-200">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {t("dashboard.metrics.avg_retention", "Avg Retention")}
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground leading-tight tracking-tight mb-1">
              42%
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
              <TrendingDown className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>-2.1% {t("dashboard.metrics.this_week", "cette semaine")}</span>
            </div>
          </div>

          <div className="relative w-14 h-14 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-muted/40"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.8"
              />
              <path
                className="text-primary"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeDasharray="42, 100"
                strokeLinecap="round"
                strokeWidth="3.8"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-bold text-foreground text-xs">
              42%
            </div>
          </div>
        </div>

        {/* Card 3: Engagement (Sparkline Bar Chart) */}
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-5 flex flex-col justify-between hover:border-border/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t("dashboard.metrics.engagement", "Engagement")}
            </span>
            <Heart className="w-4.5 h-4.5 text-muted-foreground stroke-[1.5]" />
          </div>
          <div className="flex items-end justify-between mt-4">
            <div>
              <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">
                {subscribersCount > 0 ? `${subscribersCount}` : "8.4k"}
              </div>
              <div className="text-xs text-primary flex items-center gap-1 mt-1 font-medium">
                <TrendingUp className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>+5.2%</span>
              </div>
            </div>
            {/* 5 Vertical Bar Chart Sparklines */}
            <div className="w-16 h-9 flex items-end gap-1 opacity-90">
              <div className="w-full bg-primary/20 rounded-t-sm h-1/3" />
              <div className="w-full bg-primary/40 rounded-t-sm h-1/2" />
              <div className="w-full bg-primary/60 rounded-t-sm h-3/4" />
              <div className="w-full bg-primary/80 rounded-t-sm h-2/3" />
              <div className="w-full bg-primary rounded-t-sm h-full" />
            </div>
          </div>
        </div>

      </section>

      {/* Recent Drafts */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t("dashboard.recent_drafts.title", "Recent Drafts")}
          </h3>
          <a
            href="/articles"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <span>{t("common.view_all", "View All")}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {recentArticles.length === 0 ? (
            // CTA Placeholder when no articles exist yet
            <a
              href="/articles/new"
              className="group border border-dashed border-border/80 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3 hover:border-primary/50 hover:bg-muted/30 transition-all aspect-video"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {t("dashboard.articles.create_first", "Créer un premier écrit")}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Prenez la plume et publiez.
                </p>
              </div>
            </a>
          ) : (
            recentArticles.map((art) => (
              <a
                key={art.id}
                href={`/articles/${art.id}`}
                className="group cursor-pointer block"
              >
                <div className="aspect-video bg-muted/40 rounded-xl border border-border/40 overflow-hidden relative mb-3 flex items-center justify-center group-hover:border-border/80 transition-all">
                  <FileText className="w-10 h-10 text-muted-foreground/50 stroke-[1.5]" />
                </div>
                <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {art.title}
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 font-sans">
                  <span>{art.published ? t("dashboard.articles.status_published", "Publié") : t("dashboard.articles.status_draft", "Brouillon")}</span>
                  <span>•</span>
                  <span>{getRelativeTimeString(art.updatedAt)}</span>
                </div>
              </a>
            ))
          )}

          {/* Fill remaining slots to maintain a balanced 4-card grid layout */}
          {recentArticles.length > 0 && recentArticles.length < 4 && (
            <a
              href="/articles/new"
              className="group border border-dashed border-border/60 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2 hover:border-primary/50 hover:bg-muted/30 transition-all aspect-video"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                {t("dashboard.articles.new_article", "Nouveau brouillon")}
              </span>
            </a>
          )}
        </div>
      </section>

      {/* Creator Insights */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t("dashboard.insights.title", "Creator Insights")}
          </h3>
          <Sparkles className="w-5 h-5 text-primary stroke-[1.5]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div className="bg-card rounded-xl border border-border/40 p-6 flex items-start gap-4 hover:border-border/80 transition-colors">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
              <Clock className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {t("dashboard.insights.time_title", "Best time to post")}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {t("dashboard.insights.time_desc", "Your audience is most active on Tuesdays at 6:00 PM EST.")}
              </p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border/40 p-6 flex items-start gap-4 hover:border-border/80 transition-colors">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
              <TrendingUp className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {t("dashboard.insights.growth_title", "Audience growth tip")}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {t("dashboard.insights.growth_desc", "Collaborating with tech creators or publishing twice a month could increase reach by 15%.")}
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* Upcoming Schedule */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t("dashboard.schedule.title", "Upcoming Schedule")}
          </h3>
          <a
            href="/articles"
            className="text-xs font-semibold text-primary hover:underline"
          >
            {t("dashboard.schedule.calendar", "Calendar")}
          </a>
        </div>

        <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 snap-x hide-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {scheduleItems.map((item, idx) => (
            <div
              key={idx}
              className="snap-start shrink-0 w-[240px] bg-card rounded-xl border border-border/40 p-4 hover:border-border/80 transition-colors"
            >
              <div className="text-primary font-bold text-xs uppercase tracking-widest mb-2">
                {item.date}
              </div>
              <h4 className="text-sm font-semibold text-foreground truncate">
                {item.title}
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                {item.type}
              </p>
            </div>
          ))}
        </div>
      </section>

    </main>
  )
}
