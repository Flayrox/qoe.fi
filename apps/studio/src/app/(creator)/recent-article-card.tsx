'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Building2,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@qoe/ui/ui/dropdown-menu';
import { bulkUpdateArticlesAction, deleteArticleAction } from '@qoe/sdk/actions/articles';

export interface RecentArticleCardData {
  id: string;
  title: string;
  published: boolean;
  categoryName: string | null;
  imageUrl?: string | null;
  readingTime?: number;
  authorName?: string | null;
  publicationName?: string;
  publicationType?: 'PERSONAL' | 'MEDIA';
  coAuthors?: string[];
  relation?: 'OWN' | 'MEDIA_AUTHOR' | 'COAUTHOR' | 'MEDIA_TEAM';
}

/**
 * Carte d'une publication récente du dashboard.
 *
 * Le menu n'apparaît qu'au survol (ou au focus clavier) pour ne pas charger la
 * grille, mais reste atteignable sans souris. Les actions passent par les
 * server actions existantes : aucune règle de permission n'est réimplémentée
 * côté client.
 */
export function RecentArticleCard({
  article,
  updatedLabel,
}: {
  article: RecentArticleCardData;
  updatedLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<'publication' | 'delete' | null>(null);

  const togglePublication = async () => {
    setPending('publication');
    const res = await bulkUpdateArticlesAction({
      ids: [article.id],
      published: !article.published,
    });
    setPending(null);
    if (!res.ok || res.data.failed.includes(article.id)) {
      toast.error(!res.ok ? res.error.message : t`Action impossible`);
      return;
    }
    toast.success(article.published ? t`Article dépublié.` : t`Article publié.`);
    router.refresh();
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      t`Supprimer définitivement « ${article.title} » ? Cette action est irréversible.`
    );
    if (!confirmed) return;
    setPending('delete');
    const res = await deleteArticleAction(article.id);
    setPending(null);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    toast.success(t`Article supprimé.`);
    router.refresh();
  };

  return (
    <div className="group relative">
      <Link href={`/articles/${article.id}`} className="block cursor-pointer">
        <div className="relative mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-muted/40 transition-all group-hover:border-border/50">
          {article.imageUrl ? (
            <Image
              src={article.imageUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <FileText className="h-10 w-10 text-muted-foreground/50 stroke-[1.5]" />
          )}
        </div>

        <h4 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
          {article.title}
        </h4>

        {(article.publicationType === 'MEDIA' ||
          article.relation === 'COAUTHOR' ||
          article.relation === 'MEDIA_TEAM') && (
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
            {article.publicationType === 'MEDIA' && article.publicationName && (
              <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-medium">
                <Building2 className="h-3 w-3 stroke-[1.5]" />
                {article.publicationName}
              </span>
            )}
            {article.relation === 'COAUTHOR' && (article.coAuthors?.length ?? 0) > 0 && (
              <span className="truncate">avec {article.coAuthors!.join(', ')}</span>
            )}
            {article.relation === 'MEDIA_TEAM' && article.authorName && (
              <span className="truncate">par {article.authorName}</span>
            )}
          </div>
        )}

        <div className="mt-1 flex items-center gap-2 font-sans text-xs text-muted-foreground">
          <span
            className={
              article.published ? 'font-medium text-success-text' : 'text-muted-foreground'
            }
          >
            {article.published ? t`Publié` : t`Brouillon`}
          </span>
          <span>•</span>
          <span>{updatedLabel}</span>
        </div>
      </Link>

      <div className="pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t`Actions de l'article`}
            disabled={pending !== null}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 bg-card/90 text-foreground shadow-sm backdrop-blur transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-70"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem href={`/articles/${article.id}`}>
              <Edit3 className="text-muted-foreground" strokeWidth={1.75} />
              <span>{t`Éditer l'article`}</span>
            </DropdownMenuItem>
            <DropdownMenuItem href={`/analytics/articles/${article.id}`}>
              <BarChart3 className="text-muted-foreground" strokeWidth={1.75} />
              <span>{t`Voir les analytics`}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              isDisabled={pending !== null}
              onAction={() => void togglePublication()}
            >
              {article.published ? (
                <EyeOff className="text-muted-foreground" strokeWidth={1.75} />
              ) : (
                <Eye className="text-muted-foreground" strokeWidth={1.75} />
              )}
              <span>{article.published ? t`Dépublier` : t`Publier`}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              isDisabled={pending !== null}
              onAction={() => void handleDelete()}
              className="text-destructive-text"
            >
              <Trash2 strokeWidth={1.75} />
              <span>{t`Supprimer`}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
