import React from 'react';
import { requireUser } from '@qoe/auth/current-user';
import { t } from '@lingui/core/macro';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace, type ActiveWorkspace } from '@/lib/active-workspace';
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
  Building2,
} from 'lucide-react';

// ─── Données du dashboard (miroir Go GET /v1/analytics/dashboard) ───────────
interface DashboardArticle {
  id: string;
  title: string;
  published: boolean;
  updatedAt: string;
  categoryName: string | null;
}

interface DashboardThought {
  id: string;
  content: string;
  scheduledAt: string;
}

interface DashboardLatestArticle {
  id: string;
  title: string;
  readingTime: number;
  categoryName: string | null;
  _count: { bookmarks: number; highlights: number; letters: number };
}

interface DashboardData {
  publicationWebsiteId: string;
  publishedCount: number;
  subscribersCount: number;
  premiumSubscribersCount: number;
  mrrCents: number;
  recentArticles: DashboardArticle[];
  draftArticles: DashboardArticle[];
  scheduledThoughts: DashboardThought[];
  latestPublishedArticle: DashboardLatestArticle | null;
  pageviews30d: number;
  visitors30d: number;
}

/** 🚀 Go-first : GET /v1/analytics/dashboard (workspace-aware). */
async function fetchDashboardGo(
  _userId: string,
  workspace: ActiveWorkspace
): Promise<DashboardData> {
  const qs = `?publicationId=${encodeURIComponent(workspace.publicationId)}&workspaceType=${workspace.type}`;
  return goFetch<DashboardData>(`/v1/analytics/dashboard${qs}`);
}

export default async function CreatorDashboardPage() {
  const user = await requireUser();

  // 🎛️ Workspace actif : publication personnelle OU média sélectionné
  const workspace = await getActiveWorkspace(user.id);
  const isMediaWorkspace = workspace.type === 'MEDIA';

  // 🚀 Données du dashboard : Go.
  // Dégradation gracieuse : si le workspace n'est pas encore résolvable
  // (403/erreur Go, compte sans publication personnelle), on affiche un état
  // vide au lieu de crasher la page avec des erreurs serveur répétées.
  let dashboard: DashboardData | null = null;
  try {
    dashboard = await fetchDashboardGo(user.id, workspace);
  } catch (err) {
    console.error('Dashboard indisponible (workspace non résolu ?)', err);
  }

  if (!dashboard) {
    return (
      <main className="w-full space-y-8 pb-24 md:pb-12 text-foreground font-sans selection:bg-primary/20 selection:text-primary">
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
          <p className="text-sm font-semibold text-foreground">
            Votre espace créateur n'est pas encore prêt.
          </p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Reconnectez-vous avec un compte créateur, ou terminez votre onboarding pour créer votre
            publication.
          </p>
        </div>
      </main>
    );
  }

  // Combine scheduled thoughts & draft articles into unified schedule items
  const scheduleItems = [
    ...dashboard.scheduledThoughts.map((thought) => ({
      id: thought.id,
      title: thought.content.substring(0, 40) + '...',
      type: t`Pensée programmée`,
      date: thought.scheduledAt
        ? new Date(thought.scheduledAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
          })
        : t`Programmée`,
      isScheduled: true,
      href: '/feed',
    })),
    ...dashboard.draftArticles.map((a) => ({
      id: a.id,
      title: a.title,
      type: t`Brouillon d'article`,
      date: new Date(a.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      isScheduled: false,
      href: `/articles/${a.id}`,
    })),
  ];

  const realPageviews = dashboard.pageviews30d || 0;
  const realVisitors = dashboard.visitors30d || 0;
  const mrrEur = (dashboard.mrrCents / 100).toFixed(2);
  const topArticle = dashboard.recentArticles.find((a) => a.published);

  const getRelativeTimeString = (date: string) => {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return t`Modifié à l'instant`;
    if (diffHours < 24) return t`Modifié il y a ${diffHours}h`;
    if (diffDays === 1) return t`Modifié hier`;
    if (diffDays < 7) return t`Modifié il y a ${diffDays}j`;
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const latestPublishedArticle = dashboard.latestPublishedArticle;
  const latestReactionsCount = latestPublishedArticle
    ? (latestPublishedArticle._count.bookmarks || 0) +
      (latestPublishedArticle._count.highlights || 0) +
      (latestPublishedArticle._count.letters || 0)
    : 0;

  return (
    <main className="w-full space-y-8 pb-24 md:pb-12 text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      {/* Main Stage Headline */}
      <section className="pt-2 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          {isMediaWorkspace && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
              <Building2 className="w-3 h-3" /> Média
            </span>
          )}
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-sans">
            {t`Accueil Studio`}
          </h2>
        </div>
        <p className="text-muted-foreground/80 text-sm font-sans">
          {isMediaWorkspace
            ? t`Bienvenue dans le studio du Média « ${workspace.name} ». Vue en temps réel de votre publication d'équipe.`
            : t`Bienvenue, ${user.name || t`Créateur`}. Voici l'aperçu réel de votre studio créateur.`}
        </p>
      </section>

      {/* Real Live Metrics Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Total Pageviews (Umami Real Telemetry) */}
        <div className="bg-card rounded-xl border border-border/40 shadow-none p-5 flex flex-col justify-between hover:border-border/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t`Vues totales (30j)`}
            </span>
            <Eye className="w-4.5 h-4.5 text-muted-foreground stroke-[1.5]" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">
              {realPageviews.toLocaleString()}
            </div>
            <div className="text-xs text-success flex items-center gap-1 mt-1 font-medium">
              <TrendingUp className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>
                {realVisitors.toLocaleString()} {t`lecteurs uniques`}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Active Subscribers & Paid Members (Real DB) */}
        <div className="bg-card rounded-xl border border-border/40 shadow-none p-5 flex flex-col justify-between hover:border-border/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t`Abonnés Réseau`}
            </span>
            <Users className="w-4.5 h-4.5 text-muted-foreground stroke-[1.5]" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">
              {dashboard.subscribersCount.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1 font-medium">
              <Zap className="w-3.5 h-3.5 text-primary stroke-[1.5]" />
              <span>
                {dashboard.premiumSubscribersCount} {t`abonnés payants`}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Estimated Revenue / MRR (Real DB) */}
        <div className="bg-card rounded-xl border border-border/40 shadow-none p-5 flex flex-col justify-between hover:border-border/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {t`Revenu Estimé (LTV)`}
            </span>
            <CreditCard className="w-4.5 h-4.5 text-muted-foreground stroke-[1.5]" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground leading-tight tracking-tight">
              {mrrEur} €
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1 font-medium">
              <span>
                {dashboard.publishedCount} {t`écrits publiés`}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Articles */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t`Publications récentes`}
          </h3>
          <a
            href="/articles"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <span>{t`Voir tout`}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {dashboard.recentArticles.length === 0 ? (
            <a
              href="/articles/new"
              className="group border border-dashed border-border/80 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3 hover:border-primary/50 hover:bg-muted/30 transition-all aspect-video"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {t`Créer un premier écrit`}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">{t`Prenez la plume et publiez.`}</p>
              </div>
            </a>
          ) : (
            dashboard.recentArticles.map((art) => (
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
                    {art.published ? t`Publié` : t`Brouillon`}
                  </span>
                  <span>•</span>
                  <span>{getRelativeTimeString(art.updatedAt)}</span>
                </div>
              </a>
            ))
          )}

          {dashboard.recentArticles.length > 0 && dashboard.recentArticles.length < 4 && (
            <a
              href="/articles/new"
              className="group border border-dashed border-border/60 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2 hover:border-primary/50 hover:bg-muted/30 transition-all aspect-video"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                {t`Nouveau brouillon`}
              </span>
            </a>
          )}
        </div>
      </section>

      {/* Creator Insights */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t`Analyses & Conseils Créateur`}
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
                {topArticle ? t`Dernière publication phare` : t`Prêt à publier ?`}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {topArticle
                  ? t`Votre publication "${topArticle.title}" est en ligne. Pensez à la partager sur vos réseaux.`
                  : t`Vous n'avez pas encore d'article publié. Rédigez votre premier contenu pour attirer vos premiers lecteurs.`}
              </p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border/40 p-6 flex items-start gap-4 hover:border-border/80 transition-colors">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
              <Users className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {t`Engagement de votre communauté`}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {t`Vous comptez actuellement ${dashboard.subscribersCount} abonnés inscrits. Proposez du contenu exclusif pour augmenter vos abonnements payants.`}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming / Scheduled & Draft Content */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            {t`Écrits programmés & Brouillons`}
          </h3>
          <a href="/articles" className="text-xs font-semibold text-primary hover:underline">
            {t`Calendrier des écrits`}
          </a>
        </div>

        {scheduleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl border-border/40 bg-card text-center">
            <Clock className="w-8 h-8 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <p className="text-sm font-medium text-muted-foreground">
              {t`Aucun écrit programmé ni brouillon en cours`}
            </p>
            <a
              href="/articles/new"
              className="mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
            >
              + {t`Programmer une publication`}
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
                  {t`Performance de votre dernier écrit`}
                </span>
                <h3 className="text-lg font-bold text-foreground truncate max-w-lg">
                  {latestPublishedArticle ? latestPublishedArticle.title : t`Aucun écrit publié`}
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
                  <span>{t`Éditer`}</span>
                </a>
                <a
                  href="/analytics"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <span>{t`Analyses complètes`}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
                </a>
              </div>
            )}
          </div>

          {latestPublishedArticle ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t`Statut`}
                </span>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-sm font-bold text-success">{t`En ligne`}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t`Thème`}
                </span>
                <p className="text-sm font-bold text-foreground mt-1 truncate">
                  {latestPublishedArticle.categoryName
                    ? latestPublishedArticle.categoryName
                    : t`Général`}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t`Temps de lecture`}
                </span>
                <p className="text-sm font-bold text-foreground mt-1">
                  {t`${latestPublishedArticle.readingTime || 1} min`}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t`Réactions Lecteurs`}
                </span>
                <p className="text-sm font-bold text-foreground mt-1 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-primary stroke-[1.5]" />
                  <span>{latestReactionsCount}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-muted-foreground font-sans">
              {t`Publiez votre premier article pour suivre ses performances en temps réel ici.`}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
