import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { Highlighter, ExternalLink } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { ReaderPageLayout } from '@/components/layout/ReaderPageLayout';

export default async function HighlightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Go (backend-of-record, requis en Phase 3) : GET /v1/me/highlights.
  const items = await goFetch<
    Array<{
      id: string;
      text: string;
      note: string | null;
      articleTitle: string;
      articleSlug: string;
      publicationName: string;
      subdomain: string | null;
      customDomain: string | null;
      publicationSlug: string;
    }>
  >('/v1/me/highlights?limit=100');
  const highlights = items.map((h) => ({
    id: h.id,
    text: h.text,
    note: h.note,
    article: {
      title: h.articleTitle,
      slug: h.articleSlug,
      publication: {
        name: h.publicationName,
        subdomain: h.subdomain,
        customDomain: h.customDomain,
        slug: h.publicationSlug,
      },
    },
  }));

  return (
    <ReaderPageLayout giantTitle={t`Surlignages`}>
      <div className="bg-card text-card-foreground shadow-2xl border-t border-x border-border/40 rounded-t-2xl min-h-screen mt-24 relative z-20">
        <div className="px-6 pt-6 pb-6 space-y-6">
          {/* Page header inside the sheet */}
          <div className="px-1">
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              {t`Carnet de Surlignages`}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t`Vos citations et réflexions extraites de vos lectures.`}
            </p>
          </div>

          {/* Bento shell */}
          <div className="flex flex-col gap-4">
            {highlights.length === 0 ? (
              <div className="bg-muted/40 rounded-xl p-12 border border-border/40 text-center flex flex-col items-center justify-center gap-3">
                <Highlighter className="w-10 h-10 text-muted-foreground/60" />
                <h4 className="font-bold text-sm text-foreground">{t`Aucun passage surligné`}</h4>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                  {t`Surlignez des passages dans les articles que vous lisez pour les retrouver ici.`}
                </p>
              </div>
            ) : (
              highlights.map((h) => {
                if (!h.article || !h.article.publication) return null;
                const isProd =
                  typeof window !== 'undefined'
                    ? window.location.hostname.endsWith('qoe.fi')
                    : process.env.NODE_ENV === 'production';
                const suffix = isProd ? 'qoe.fi' : 'localhost';
                const protocol = isProd ? 'https:' : 'http:';
                const host =
                  h.article.publication.customDomain ||
                  (h.article.publication.subdomain
                    ? `${h.article.publication.subdomain}.${suffix}`
                    : '');
                const url = host ? `${protocol}//${host}/article/${h.article.slug}` : '#';

                return (
                  <div
                    key={h.id}
                    className="bg-card rounded-xl p-5 border border-border/60 shadow-xs flex flex-col gap-4 hover:border-primary/40 transition-colors"
                  >
                    {/* Highlighted text */}
                    <div className="border-l-2 border-primary/80 pl-4">
                      <p className="text-sm text-foreground italic leading-relaxed font-sans">
                        "{h.text}"
                      </p>
                    </div>

                    {/* Personal note */}
                    {h.note && (
                      <div className="bg-muted/50 border border-border/40 rounded-lg p-3">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                          {t`Votre Note`}
                        </span>
                        <p className="text-xs text-foreground leading-relaxed">{h.note}</p>
                      </div>
                    )}

                    {/* Source info */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/40 text-[10px] text-muted-foreground">
                      <span className="font-medium truncate max-w-[60%]">
                        {t`Surligné dans :`} {h.article.title}
                      </span>
                      <a
                        href={url}
                        target="_blank"
                        className="text-primary hover:underline font-semibold flex items-center gap-1 shrink-0"
                      >
                        {t`Consulter`} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </ReaderPageLayout>
  );
}
