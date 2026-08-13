import React from 'react';
import { prisma } from '@qoe/db/client';
import { requireUser } from '@qoe/auth/current-user';
import { getTranslate } from '@qoe/i18n/server';
import { fetchUmamiWebsiteStats } from '@qoe/analytics/server';
import {
  Eye,
  TrendingUp,
  Users,
  CreditCard,
  Sparkles,
  Clock,
  Plus,
  FileText,
  ArrowUpRight,
  Zap,
  BarChart3,
  MessageSquare,
  Edit3,
} from 'lucide-react';

export default async function CreatorDashboardPage() {
  const user = await requireUser();
  const t = await getTranslate();

  // Fetch creator profile details for Umami website ID
  const creator = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      umamiWebsiteId: true,
    },
  });

  const targetWebsiteId = creator?.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '';
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Fetch real database & telemetry metrics in parallel
  const [
    publishedCount,
    subscribersCount,
    premiumSubscribersCount,
    subscribersList,
    recentArticles,
    draftArticles,
    scheduledThoughts,
    latestPublishedArticle,
    telemetryStats,
  ] = await Promise.all([
    prisma.article.count({ where: { authorId: user.id, published: true } }),
    prisma.subscriber.count({ where: { creatorId: user.id, isActive: true } }),
    prisma.subscriber.count({ where: { creatorId: user.id, isActive: true, isPremium: true } }),
    prisma.subscriber.findMany({
      where: { creatorId: user.id, isActive: true },
      select: { ltvCents: true, createdAt: true },
    }),
    prisma.article.findMany({
      where: { authorId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 4,
      include: { category: true },
    }),
    prisma.article.findMany({
      where: { authorId: user.id, published: false },
      orderBy: { updatedAt: 'desc' },
      take: 4,
    }),
    prisma.thought.findMany({
      where: { authorId: user.id, scheduledAt: { not: null } },
      orderBy: { scheduledAt: 'asc' },
      take: 4,
    }),
    prisma.article.findFirst({
      where: { authorId: user.id, published: true },
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        _count: {
          select: {
            bookmarks: true,
            highlights: true,
            letters: true,
          },
        },
      },
    }),
    fetchUmamiWebsiteStats(targetWebsiteId, thirtyDaysAgo, now),
  ]);

  // Combine scheduled thoughts & draft articles into unified schedule items
  const scheduleItems = [
    ...scheduledThoughts.map((t) => ({
      id: t.id,
      title: t.content.substring(0, 40) + '...',
      type: 'Pensée programmée',
      date: t.scheduledAt
        ? new Date(t.scheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        : 'Programmée',
      isScheduled: true,
      href: '/feed',
    })),
    ...draftArticles.map((a) => ({
      id: a.id,
      title: a.title,
      type: "Brouillon d'article",
      date: new Date(a.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      isScheduled: false,
      href: `/articles/${a.id}`,
    })),
  ];

  const realPageviews = telemetryStats?.pageviews || 0;
  const realVisitors = telemetryStats?.visitors || 0;
  const totalLtvCents = subscribersList.reduce((acc, sub) => acc + (sub.ltvCents || 0), 0);
  const mrrEur = (totalLtvCents / 100).toFixed(2);
  const topArticle = recentArticles.find((a) => a.published);

  const getRelativeTimeString = (date: Date) => {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return t('common.relative_time_now', "Modifié à l'instant");
    if (diffHours < 24)
      return t('common.relative_time_hours', `Modifié il y a ${diffHours}h`, { count: diffHours });
    if (diffDays === 1) return t('common.relative_time_yesterday', 'Modifié hier');
    if (diffDays < 7)
      return t('common.relative_time_days', `Modifié il y a ${diffDays}j`, { count: diffDays });
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const latestReactionsCount = latestPublishedArticle
    ? (latestPublishedArticle._count.bookmarks || 0) +
      (latestPublishedArticle._count.highlights || 0) +
      (latestPublishedArticle._count.letters || 0)
    : 0;

  return (
    <main className="w-full space-y-8 pb-24 md:pb-12 text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      {/* Main Stage Headline */}
      <section className="pt-2 space-y-0.5">
        <h2 className="text-3xl font-bold tracking-tight text-foreground font-sans">
          {t('dashboard.welcome_home', 'Accueil Studio')}
        </h2>
        <p className="text-muted-foreground/80 text-sm font-sans">
          {t(
            'dashboard.welcome_subtitle',
            "Bienvenue, {{name}}. Voici l'aperçu réel de votre studio créateur.",
            { name: user.name || 'Créateur' }
          )}
        </p>
      </section>

      {/* Real Live Metrics Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Total Pageviews (Umami Real Telemetry) */}
        <div className="bg-card rounded-xl border border-border/40 shadow-none p-5 flex flex-col justify-between hover:border-border/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t('dashboard.metrics.total_views', 'Vues totales (30j)')}
            </span>
            <Eye className="w-4.5 h-4.5 text-muted-foreground stroke-[1.5]" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">
              {realPageviews.toLocaleString()}
            </div>
            <div className="text-xs text-success flex items-center gap-1 mt-1 font-medium">
              <TrendingUp className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>{realVisitors.toLocaleString()} lecteurs uniques</span>
            </div>
          </div>
        </div>

        {/* Card 2: Active Subscribers & Paid Members (Real DB) */}
        <div className="bg-card rounded-xl border border-border/40 shadow-none p-5 flex flex-col justify-between hover:border-border/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t('dashboard.metrics.subscribers', 'Abonnés Réseau')}
            </span>
            <Users className="w-4.5 h-4.5 text-muted-foreground stroke-[1.5]" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">
              {subscribersCount.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1 font-medium">
              <Zap className="w-3.5 h-3.5 text-primary stroke-[1.5]" />
              <span>{premiumSubscribersCount} abonnés payants</span>
            </div>
          </div>
        </div>

        {/* Card 3: Estimated Revenue / MRR (Real DB) */}
        <div className="bg-card rounded-xl border border-border/40 shadow-none p-5 flex flex-col justify-between hover:border-border/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t('dashboard.metrics.revenue', 'Revenu Estimé (LTV)')}
            </span>
            <CreditCard className="w-4.5 h-4.5 text-muted-foreground stroke-[1.5]" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">
              {mrrEur} €
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1 font-medium">
              <span>{publishedCount} écrits publiés</span>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Articles */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t('dashboard.recent_drafts.title', 'Publications récentes')}
          </h3>
          <a
            href="/articles"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <span>{t('common.view_all', 'Voir tout')}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {recentArticles.length === 0 ? (
            <a
              href="/articles/new"
              className="group border border-dashed border-border/80 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3 hover:border-primary/50 hover:bg-muted/30 transition-all aspect-video"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {t('dashboard.articles.create_first', 'Créer un premier écrit')}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">Prenez la plume et publiez.</p>
              </div>
            </a>
          ) : (
            recentArticles.map((art) => (
              <a key={art.id} href={`/articles/${art.id}`} className="group cursor-pointer block">
                <div className="aspect-video bg-muted/40 rounded-xl border border-border/40 overflow-hidden relative mb-3 flex items-center justify-center group-hover:border-border/80 transition-all">
                  <FileText className="w-10 h-10 text-muted-foreground/50 stroke-[1.5]" />
                </div>
                <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {art.title}
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 font-sans">
                  <span
                    className={art.published ? 'text-success font-medium' : 'text-muted-foreground'}
                  >
                    {art.published
                      ? t('dashboard.articles.status_published', 'Publié')
                      : t('dashboard.articles.status_draft', 'Brouillon')}
                  </span>
                  <span>•</span>
                  <span>{getRelativeTimeString(art.updatedAt)}</span>
                </div>
              </a>
            ))
          )}

          {recentArticles.length > 0 && recentArticles.length < 4 && (
            <a
              href="/articles/new"
              className="group border border-dashed border-border/60 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2 hover:border-primary/50 hover:bg-muted/30 transition-all aspect-video"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                {t('dashboard.articles.new_article', 'Nouveau brouillon')}
              </span>
            </a>
          )}
        </div>
      </section>

      {/* Creator Insights */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t('dashboard.insights.title', 'Analyses & Conseils Créateur')}
          </h3>
          <Sparkles className="w-5 h-5 text-primary stroke-[1.5]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border/40 p-6 flex items-start gap-4 hover:border-border/80 transition-colors">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
              <FileText className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {topArticle ? 'Dernière publication phare' : 'Prêt à publier ?'}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {topArticle
                  ? `Votre publication "${topArticle.title}" est en ligne. Pensez à la partager sur vos réseaux.`
                  : "Vous n'avez pas encore d'article publié. Rédigez votre premier contenu pour attirer vos premiers lecteurs."}
              </p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border/40 p-6 flex items-start gap-4 hover:border-border/80 transition-colors">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
              <Users className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Engagement de votre communauté
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Vous comptez actuellement {subscribersCount} abonnés inscrits. Proposez du contenu
                exclusif pour augmenter vos abonnements payants.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming / Scheduled & Draft Content */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t('dashboard.schedule.title', 'Écrits programmés & Brouillons')}
          </h3>
          <a href="/articles" className="text-xs font-semibold text-primary hover:underline">
            {t('dashboard.schedule.calendar', 'Calendrier des écrits')}
          </a>
        </div>

        {scheduleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl border-border/40 bg-card text-center">
            <Clock className="w-8 h-8 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <p className="text-sm font-medium text-muted-foreground">
              Aucun écrit programmé ni brouillon en cours
            </p>
            <a
              href="/articles/new"
              className="mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
            >
              + Programmer une publication
            </a>
          </div>
        ) : (
          <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 snap-x hide-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {scheduleItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="snap-start shrink-0 w-[240px] bg-card rounded-xl border border-border/40 p-4 hover:border-border/80 transition-colors block"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${item.isScheduled ? 'text-success' : 'text-primary'}`}
                  >
                    {item.date}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                    {item.type}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-foreground truncate">{item.title}</h4>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* ─── Latest Post Performance Banner (Bottom of Dashboard) ─── */}
      <section className="pt-4 border-t border-border/30">
        <div className="bg-card border border-border/40 rounded-2xl p-6 sm:p-8 space-y-6 shadow-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BarChart3 className="h-5 w-5 stroke-[1.5]" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Performance de votre dernier écrit
                </span>
                <h3 className="text-lg font-bold text-foreground truncate max-w-lg">
                  {latestPublishedArticle ? latestPublishedArticle.title : 'Aucun écrit publié'}
                </h3>
              </div>
            </div>

            {latestPublishedArticle && (
              <div className="flex items-center gap-2">
                <a
                  href={`/articles/${latestPublishedArticle.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/40 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5 stroke-[1.5]" />
                  <span>Éditer</span>
                </a>
                <a
                  href="/analytics"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <span>Analyses complètes</span>
                  <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
                </a>
              </div>
            )}
          </div>

          {latestPublishedArticle ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Statut
                </span>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-sm font-bold text-success">En ligne</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Thème
                </span>
                <p className="text-sm font-bold text-foreground mt-1 truncate">
                  {latestPublishedArticle.category
                    ? latestPublishedArticle.category.name
                    : 'Général'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Temps de lecture
                </span>
                <p className="text-sm font-bold text-foreground mt-1">
                  {latestPublishedArticle.readingTime || 1} min
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Réactions Lecteurs
                </span>
                <p className="text-sm font-bold text-foreground mt-1 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-primary stroke-[1.5]" />
                  <span>{latestReactionsCount}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-muted-foreground font-sans">
              Publiez votre premier article pour suivre ses performances en temps réel ici.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
