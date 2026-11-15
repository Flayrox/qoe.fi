import { countImagesWithoutAlt } from '@/features/editor/lib/accessibility';
import { countInvalidLinks, countWordsInHtml } from '@/features/editor/lib/preflight';

/** Sous-ensemble d'un article nécessaire au diagnostic éditorial. */
export interface HealthArticleInput {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  status?: string;
  imageUrl?: string | null;
  coverAlt?: string | null;
  coverDecorative?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  updatedAt: string | Date;
}

export type HealthIssueId =
  | 'missingCover'
  | 'coverWithoutAlt'
  | 'imagesWithoutAlt'
  | 'missingSeoTitle'
  | 'missingSeoDescription'
  | 'shortContent'
  | 'stale'
  | 'uncategorized'
  | 'invalidLinks';

export interface HealthIssueDefinition {
  id: HealthIssueId;
  label: string;
  /** Ce que l'auteur peut corriger, en une phrase. */
  hint: string;
}

/**
 * Ordre d'affichage : les manques les plus visibles (couverture, images) avant
 * les finitions SEO. Toutes les règles sont des avertissements : aucune ne
 * bloque la publication, elles guident une reprise.
 */
export const HEALTH_ISSUES: readonly HealthIssueDefinition[] = [
  {
    id: 'missingCover',
    label: 'Couverture absente',
    hint: 'Le partage utilisera la couverture de la publication.',
  },
  {
    id: 'coverWithoutAlt',
    label: 'Alt de couverture',
    hint: 'Décrivez la couverture ou marquez-la décorative.',
  },
  {
    id: 'imagesWithoutAlt',
    label: 'Images sans alt',
    hint: 'Chaque image de contenu doit avoir une description.',
  },
  {
    id: 'missingSeoTitle',
    label: 'Titre SEO vide',
    hint: 'Le titre de l’article sera utilisé par défaut.',
  },
  {
    id: 'missingSeoDescription',
    label: 'Description SEO vide',
    hint: 'Un extrait public sera généré par défaut.',
  },
  {
    id: 'shortContent',
    label: 'Contenu court',
    hint: 'Moins de 150 mots : vérifiez que l’article tient debout.',
  },
  {
    id: 'stale',
    label: 'À rafraîchir',
    hint: 'Aucune mise à jour depuis plus d’un an.',
  },
  {
    id: 'uncategorized',
    label: 'Sans catégorie',
    hint: 'Classez l’article pour la navigation et le maillage.',
  },
  {
    id: 'invalidLinks',
    label: 'Liens à vérifier',
    hint: 'Un lien du corps est vide ou utilise un schéma interdit.',
  },
] as const;

export interface ArticleHealth {
  id: string;
  title: string;
  slug: string;
  updatedAt: string;
  words: number;
  issues: HealthIssueId[];
}

export interface ContentHealthReport {
  /** Articles analysés (publiés uniquement : les brouillons ne sont pas notés). */
  publishedCount: number;
  /** Articles publiés sans aucun point à corriger. */
  healthyCount: number;
  /** Part des articles publiés sans point à corriger, 0–100. */
  score: number;
  issueCounts: Record<HealthIssueId, number>;
  articles: ArticleHealth[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 365;
const SHORT_CONTENT_WORDS = 150;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function isStale(updatedAt: string | Date, now: Date): boolean {
  const updated = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return false;
  return now.getTime() - updated.getTime() > STALE_AFTER_DAYS * DAY_MS;
}

/**
 * Diagnostique les articles **publiés** d'une publication. Les brouillons sont
 * volontairement ignorés : un brouillon vide ou sans couverture est un travail
 * en cours, pas un défaut de santé.
 *
 * Le score est la part d'articles publiés sans aucun point à corriger : une
 * mesure simple, stable et lisible, qui ne mélange pas sévérités et volumes.
 */
export function analyzeContentHealth(
  articles: readonly HealthArticleInput[],
  now: Date = new Date()
): ContentHealthReport {
  const issueCounts = Object.fromEntries(HEALTH_ISSUES.map((issue) => [issue.id, 0])) as Record<
    HealthIssueId,
    number
  >;

  const published = articles.filter((article) => article.published);
  const diagnosed: ArticleHealth[] = [];

  for (const article of published) {
    const content = article.content ?? '';
    const words = countWordsInHtml(content);
    const alt = countImagesWithoutAlt(content);
    const invalidLinks = countInvalidLinks(content);
    const hasCover = hasText(article.imageUrl);
    const issues: HealthIssueId[] = [];

    if (!hasCover) issues.push('missingCover');
    if (hasCover && !article.coverDecorative && !hasText(article.coverAlt)) {
      issues.push('coverWithoutAlt');
    }
    if (alt.missing > 0) issues.push('imagesWithoutAlt');
    if (!hasText(article.seoTitle)) issues.push('missingSeoTitle');
    if (!hasText(article.seoDescription)) issues.push('missingSeoDescription');
    if (words < SHORT_CONTENT_WORDS) issues.push('shortContent');
    if (isStale(article.updatedAt, now)) issues.push('stale');
    if (!article.categoryId && !article.category) issues.push('uncategorized');
    if (invalidLinks > 0) issues.push('invalidLinks');

    if (issues.length === 0) continue;

    for (const issue of issues) issueCounts[issue] += 1;

    diagnosed.push({
      id: article.id,
      title: article.title,
      slug: article.slug,
      updatedAt:
        article.updatedAt instanceof Date
          ? article.updatedAt.toISOString()
          : String(article.updatedAt),
      words,
      issues,
    });
  }

  diagnosed.sort((a, b) => {
    if (b.issues.length !== a.issues.length) return b.issues.length - a.issues.length;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  const healthyCount = published.length - diagnosed.length;

  return {
    publishedCount: published.length,
    healthyCount,
    score: published.length === 0 ? 100 : Math.round((healthyCount / published.length) * 100),
    issueCounts,
    articles: diagnosed,
  };
}

export function issueDefinition(id: HealthIssueId): HealthIssueDefinition {
  return HEALTH_ISSUES.find((issue) => issue.id === id) ?? HEALTH_ISSUES[0]!;
}
