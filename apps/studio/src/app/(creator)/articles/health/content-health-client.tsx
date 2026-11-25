'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  Image as ImageIcon,
  Link2,
  Search,
  Sparkles,
  Tags,
} from 'lucide-react';
import { Button, buttonClasses } from '@qoe/ui/button';
import { StudioHeader, StudioPage, StudioSection } from '@/components/studio-page';
import { t } from '@lingui/core/macro';

import {
  analyzeContentHealth,
  HEALTH_ISSUES,
  issueDefinition,
  type HealthArticleInput,
  type HealthIssueId,
} from '@/features/content-health/lib/content-health';

const ISSUE_ICONS: Record<HealthIssueId, typeof ImageIcon> = {
  missingCover: ImageIcon,
  coverWithoutAlt: ImageIcon,
  imagesWithoutAlt: ImageIcon,
  missingSeoTitle: Search,
  missingSeoDescription: Search,
  shortContent: FileWarning,
  stale: CalendarClock,
  uncategorized: Tags,
  invalidLinks: Link2,
};

type Filter = HealthIssueId | 'all';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function ContentHealthClient({
  articles,
  loadError = null,
}: {
  articles: HealthArticleInput[];
  loadError?: string | null;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const report = useMemo(() => analyzeContentHealth(articles), [articles]);

  const visibleArticles = useMemo(
    () =>
      filter === 'all'
        ? report.articles
        : report.articles.filter((article) => article.issues.includes(filter)),
    [filter, report.articles]
  );

  return (
    <StudioPage className="pb-16">
      <StudioHeader
        title={t`Santé du contenu`}
        description={t`Repérez ce qui affaiblit vos articles publiés, puis corrigez au bon endroit.`}
        actions={
          <Link href="/articles" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
            <ArrowLeft />
            <span>{t`Retour aux articles`}</span>
          </Link>
        }
      />

      {loadError ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{loadError}</p>
        </div>
      ) : report.publishedCount === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-16 text-center">
          <Sparkles className="size-7 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-foreground">{t`Aucun article publié`}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {t`La santé du contenu analyse uniquement les articles publiés. Publiez un premier écrit pour voir apparaître le diagnostic.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t`Score de santé`}
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                {report.score}
                <span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t`Part des articles publiés sans aucun point à corriger.`}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t`À vérifier`}
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                {report.articles.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {report.publishedCount > 1
                  ? t`sur ${report.publishedCount} articles publiés.`
                  : t`sur ${report.publishedCount} article publié.`}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t`Sans défaut`}
              </p>
              <p className="mt-2 flex items-center gap-2 text-3xl font-semibold tabular-nums text-foreground">
                {report.healthyCount}
                <CheckCircle2 className="size-5 text-primary" strokeWidth={1.5} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t`Couverture, alt, SEO, catégorie et liens au vert.`}
              </p>
            </div>
          </div>

          <section aria-labelledby="health-filters" className="space-y-2">
            <h2 id="health-filters" className="text-xs font-semibold text-foreground">
              {t`Filtrer par point à corriger`}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant={filter === 'all' ? 'solid' : 'outline'}
                size="xs"
                onClick={() => setFilter('all')}
                aria-pressed={filter === 'all'}
              >
                {t`Tout`} ({report.articles.length})
              </Button>
              {HEALTH_ISSUES.map((issue) => {
                const Icon = ISSUE_ICONS[issue.id];
                const count = report.issueCounts[issue.id];
                const active = filter === issue.id;
                return (
                  <Button
                    key={issue.id}
                    type="button"
                    variant={active ? 'solid' : 'outline'}
                    size="xs"
                    onClick={() => setFilter(active ? 'all' : issue.id)}
                    aria-pressed={active}
                    disabled={count === 0}
                    title={issue.hint}
                    className={
                      count === 0
                        ? 'opacity-45 h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block '
                        : undefined
                    }
                  >
                    <Icon className="size-3.5!" strokeWidth={1.5} />
                    {issue.label} ({count})
                  </Button>
                );
              })}
            </div>
          </section>

          {visibleArticles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-14 text-center">
              <CheckCircle2 className="size-7 text-primary" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-foreground">
                {filter === 'all'
                  ? t`Tous vos articles publiés sont au vert`
                  : t`Rien à corriger sur ce critère`}
              </p>
              <p className="text-xs text-muted-foreground">
                {t`Les brouillons ne sont pas notés : ils restent votre espace de travail.`}
              </p>
            </div>
          ) : (
            <StudioSection
              icon={FileWarning}
              title={
                filter === 'all'
                  ? t`Articles à reprendre`
                  : `${issueDefinition(filter).label} — ${visibleArticles.length}`
              }
            >
              <p className="mb-3 text-xs text-muted-foreground">
                {filter === 'all'
                  ? t`Les défauts sont cumulés par article ; ouvrez un écrit pour le corriger en contexte.`
                  : issueDefinition(filter).hint}
              </p>
              <ul className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card">
                {visibleArticles.map((article) => (
                  <li
                    key={article.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/articles/${article.id}`}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {article.title || t`Sans titre`}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        /{article.slug} · {t`modifié le`} {formatDate(article.updatedAt)} ·{' '}
                        {article.words} {t`mots`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {article.issues.map((issue) => {
                          const definition = issueDefinition(issue);
                          const Icon = ISSUE_ICONS[issue];
                          return (
                            <span
                              key={issue}
                              title={definition.hint}
                              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              <Icon className="size-3" strokeWidth={1.5} />
                              {definition.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <Link
                      href={`/articles/${article.id}`}
                      className={buttonClasses({
                        variant: 'outline',
                        size: 'xs',
                        className: 'shrink-0',
                      })}
                    >
                      {t`Corriger`}
                      <ArrowUpRight />
                    </Link>
                  </li>
                ))}
              </ul>
            </StudioSection>
          )}
        </div>
      )}
    </StudioPage>
  );
}
