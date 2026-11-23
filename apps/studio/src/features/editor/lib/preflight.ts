import { countImagesWithoutAlt } from './accessibility';
import { normalizeLinkUrl } from './link';
import { t } from '@lingui/core/macro';

export type PreflightStatus = 'ok' | 'warning' | 'error' | 'info';

export interface PreflightCheck {
  id: 'title' | 'content' | 'slug' | 'images' | 'cover' | 'seoTitle' | 'seoDescription' | 'links';
  label: string;
  detail: string;
  status: PreflightStatus;
}

export interface PublishReadinessInput {
  title: string;
  slug: string;
  contentHtml: string;
  imageUrl?: string | null;
  coverAlt?: string;
  coverDecorative?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isPremium?: boolean;
  published?: boolean;
}

export interface PublishReadinessResult {
  checks: PreflightCheck[];
  errors: number;
  warnings: number;
  /** false seulement s'il reste un blocage : un avertissement n'empêche pas de publier. */
  ready: boolean;
}

const LINK_TAG = /<a\b[^>]*>/gi;
const HREF_ATTRIBUTE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

function textFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWordsInHtml(html: string): number {
  const text = textFromHtml(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Liens dont la destination est vide, un ancêtre factice ou un schéma interdit. */
export function countInvalidLinks(html: string): number {
  const tags = html.match(LINK_TAG) ?? [];
  let invalid = 0;
  for (const tag of tags) {
    const match = HREF_ATTRIBUTE.exec(tag);
    const href = (match?.[1] ?? match?.[2] ?? '').trim();
    if (!href || href === '#' || normalizeLinkUrl(href) === null) invalid += 1;
  }
  return invalid;
}

/**
 * Contrôles locaux avant publication. Volontairement indépendant du serveur :
 * le Go reste la source de vérité pour les droits, la revue et le paywall.
 * Un `error` bloque la publication dans l'UI ; un `warning` est un conseil.
 */
export function analyzePublishReadiness(input: PublishReadinessInput): PublishReadinessResult {
  const title = input.title.trim();
  const slug = input.slug.trim();
  const seoTitle = (input.seoTitle ?? '').trim();
  const seoDescription = (input.seoDescription ?? '').trim();
  const words = countWordsInHtml(input.contentHtml);
  const images = countImagesWithoutAlt(input.contentHtml);
  const invalidLinks = countInvalidLinks(input.contentHtml);
  const hasCover = Boolean(input.imageUrl?.trim());

  const checks: PreflightCheck[] = [];

  checks.push(
    !title
      ? {
          id: 'title',
          label: 'Titre',
          detail: 'Le titre est requis avant de publier.',
          status: 'error',
        }
      : title.length < 10 || title.length > 120
        ? {
            id: 'title',
            label: 'Titre',
            detail: `${title.length} caractères : visez 10 à 120 pour un titre lisible en partage.`,
            status: 'warning',
          }
        : {
            id: 'title',
            label: 'Titre',
            detail: `${title.length} caractères.`,
            status: 'ok',
          }
  );

  checks.push(
    words === 0
      ? {
          id: 'content',
          label: 'Contenu',
          detail: 'Le corps est vide : ajoutez au moins un paragraphe avant de publier.',
          status: 'error',
        }
      : words < 100
        ? {
            id: 'content',
            label: 'Contenu',
            detail: `${words} mots : court, mais publiable.`,
            status: 'warning',
          }
        : {
            id: 'content',
            label: 'Contenu',
            detail: `${words} mots.`,
            status: 'ok',
          }
  );

  checks.push(
    slug
      ? { id: 'slug', label: 'URL', detail: `/${slug}`, status: 'ok' }
      : {
          id: 'slug',
          label: 'URL',
          detail: t`Le slug est vide : l'URL sera générée à partir du titre.`,
          status: 'warning',
        }
  );

  checks.push(
    images.missing > 0
      ? {
          id: 'images',
          label: 'Descriptions des images',
          detail: `${images.missing} image${images.missing === 1 ? '' : 's'} sans alt sur ${images.total}.`,
          status: 'warning',
        }
      : {
          id: 'images',
          label: 'Descriptions des images',
          detail:
            images.total === 0
              ? 'Aucune image dans le corps.'
              : `${images.total} image${images.total === 1 ? '' : 's'} décrite${images.total === 1 ? '' : 's'}.`,
          status: images.total === 0 ? 'info' : 'ok',
        }
  );

  checks.push(
    !hasCover
      ? {
          id: 'cover',
          label: 'Couverture',
          detail: 'Aucune couverture : le partage utilisera le repli de la publication.',
          status: 'info',
        }
      : input.coverDecorative
        ? {
            id: 'cover',
            label: 'Couverture',
            detail: t`Image décorative : elle sera ignorée par les lecteurs d’écran.`,
            status: 'ok',
          }
        : (input.coverAlt ?? '').trim()
          ? {
              id: 'cover',
              label: 'Couverture',
              detail: t`Description alternative renseignée.`,
              status: 'ok',
            }
          : {
              id: 'cover',
              label: 'Couverture',
              detail: t`Alt manquant : le titre sera utilisé comme repli.`,
              status: 'warning',
            }
  );

  checks.push(
    !seoTitle
      ? {
          id: 'seoTitle',
          label: 'Titre SEO',
          detail: t`Vide : le titre de l’article sera utilisé.`,
          status: 'warning',
        }
      : seoTitle.length > 60
        ? {
            id: 'seoTitle',
            label: 'Titre SEO',
            detail: `${seoTitle.length} caractères : au-delà de 60, il sera tronqué dans les résultats.`,
            status: 'warning',
          }
        : {
            id: 'seoTitle',
            label: 'Titre SEO',
            detail: `${seoTitle.length} caractères.`,
            status: 'ok',
          }
  );

  checks.push(
    !seoDescription
      ? {
          id: 'seoDescription',
          label: 'Description SEO',
          detail: t`Vide : un extrait public sera généré.`,
          status: 'warning',
        }
      : seoDescription.length > 160
        ? {
            id: 'seoDescription',
            label: 'Description SEO',
            detail: `${seoDescription.length} caractères : visez 160 maximum.`,
            status: 'warning',
          }
        : {
            id: 'seoDescription',
            label: 'Description SEO',
            detail: `${seoDescription.length} caractères.`,
            status: 'ok',
          }
  );

  checks.push(
    invalidLinks > 0
      ? {
          id: 'links',
          label: 'Liens',
          detail: `${invalidLinks} lien${invalidLinks === 1 ? '' : 's'} sans destination valide.`,
          status: 'warning',
        }
      : {
          id: 'links',
          label: 'Liens',
          detail: 'Toutes les destinations sont valides.',
          status: 'ok',
        }
  );

  const errors = checks.filter((check) => check.status === 'error').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;

  return { checks, errors, warnings, ready: errors === 0 };
}
