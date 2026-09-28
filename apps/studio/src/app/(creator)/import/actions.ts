'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { revalidatePath } from 'next/cache';
import DOMPurify from 'isomorphic-dompurify';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { validateSafeExternalUrl } from '@qoe/utils';
import { getActivePublicationId } from '@/lib/active-workspace';

async function getAuthenticatedCreator() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Non authentifié');

  return authUser;
}

/**
 * 📰 Importer des articles depuis un flux RSS / Substack / Ghost URL
 * Go-first : le parsing + l'assainissement restent ici (logique pure, zéro DB),
 * la création dédupliquée des articles est déléguée à POST /v1/import/articles.
 */
export async function importRssFeedAction(rssUrl: string) {
  try {
    const creator = await getAuthenticatedCreator();

    // 🛡️ Blindage anti-SSRF (DNS rebinding, loopback, metadata cloud, ports non-standards)
    const ssrfCheck = await validateSafeExternalUrl(rssUrl);
    if (!ssrfCheck.valid || !ssrfCheck.url) {
      return {
        success: false,
        error: ssrfCheck.error || 'URL de flux RSS invalide ou non sécurisée',
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(ssrfCheck.url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'qoe-fi-importer/1.0 (+https://qoe.fi)',
        Accept: 'application/rss+xml, application/atom+xml, text/xml, application/xml, */*',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        error: `Impossible de récupérer le flux RSS (Statut ${res.status})`,
      };
    }

    // Protection anti-bombe mémoire (max 10 Mo)
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      return { success: false, error: 'Le flux RSS dépasse la taille maximale autorisée (10 Mo)' };
    }

    const xmlText = await res.text();
    if (xmlText.length > 10 * 1024 * 1024) {
      return { success: false, error: 'Le contenu du flux RSS est trop volumineux' };
    }

    // Extract items using regex matches for RSS/Atom tags
    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    const itemMatches = xmlText.match(itemRegex) || [];

    if (itemMatches.length === 0) {
      return { success: false, error: 'Aucun article trouvé dans ce flux RSS' };
    }

    const publicationId = await getActivePublicationId(creator.id);
    const articles: { title: string; slug: string; content: string; readingTime: number }[] = [];

    for (const itemXml of itemMatches) {
      const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : 'Article sans titre';

      const contentMatch =
        itemXml.match(
          /<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i
        ) || itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

      const rawContent = contentMatch ? contentMatch[1].trim() : '';
      if (!rawContent) continue;

      // Sanitize HTML with DOMPurify
      const safeHtml = DOMPurify.sanitize(rawContent, {
        ALLOWED_TAGS: [
          'p',
          'br',
          'b',
          'i',
          'em',
          'strong',
          'a',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'ul',
          'ol',
          'li',
          'blockquote',
          'code',
          'pre',
          'img',
          'figure',
          'figcaption',
          'hr',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'class'],
        ALLOW_DATA_ATTR: true,
      });

      // Generate slug
      const slug =
        title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || `article-${Date.now()}`;

      articles.push({
        title,
        slug,
        content: safeHtml,
        readingTime: Math.max(
          1,
          Math.ceil(safeHtml.replace(/<[^>]+>/g, '').split(/\s+/).length / 200)
        ),
      });
    }

    // 🚀 Go-first : création dédupliquée (par publicationId + slug) côté Go.
    const resp = await goFetch<{ importedCount: number }>('/v1/import/articles', {
      method: 'POST',
      body: { publicationId, articles },
    });
    const importedArticlesCount = resp.importedCount ?? 0;

    revalidatePath('/articles');
    return { success: true, count: importedArticlesCount };
  } catch (err: unknown) {
    console.error('[RSS Import Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec de l'importation RSS",
    };
  }
}

/**
 * 👥 Déposer une liste d'abonnés (Substack, Ghost, Beehiiv) pour revue.
 *
 * ⚠️ Ce que cette fonction ne fait plus : elle bouclait sur les adresses du CSV
 * et appelait `POST /v1/home/subscribe` pour chacune. Cet endpoint crée un
 * abonné avec `confirmedAt = now()` et `receiveArticles = true` : déposer un
 * fichier suffisait donc à rendre des milliers d'adresses immédiatement
 * destinataires de la prochaine campagne, avec une confirmation que personne
 * n'avait effectuée.
 *
 * Désormais le fichier part en **quarantaine** : aucun contact n'est créé,
 * aucun email n'est envoyé, aucune adresse n'est rattachée à la publication.
 * Le lot est examiné par le staff, qui décide du mode de traitement.
 */
export interface SubscriberImportDeclarations {
  /** Aucune adresse achetée ni louée. */
  noPurchased: boolean;
  /** Aucune adresse collectée sur le Web (scraping). */
  noScraped: boolean;
  /** Aucun contact désabonné, et la liste de suppression est identifiée. */
  noUnsubscribed: boolean;
  suppressionListIdentified: boolean;
  /** Finalité annoncée aux personnes lors de la collecte. */
  consentPurpose: string;
}

export interface SubscriberImportOptions {
  source?: string;
  sourceDetail?: string;
  collectionPeriod?: string;
  optInMethod?: string;
  lastSendAt?: string;
  declarations: SubscriberImportDeclarations;
}

export interface SubscriberImportStats {
  received: number;
  valid: number;
  invalid: number;
  duplicates: number;
  suppressed: number;
  alreadySubscribed: number;
  pendingConfirmation: number;
  excluded: number;
  truncated: boolean;
}

export interface SubscriberImportResult {
  success: boolean;
  error?: string;
  batchId?: string;
  status?: string;
  stats?: SubscriberImportStats;
}

export async function importSubscribersCsvAction(
  csvContent: string,
  options: SubscriberImportOptions
): Promise<SubscriberImportResult> {
  try {
    const creator = await getAuthenticatedCreator();
    const publicationId = await getActivePublicationId(creator.id);

    if (!csvContent || !csvContent.trim()) {
      return { success: false, error: 'Fichier CSV vide' };
    }
    const declarations = options?.declarations;
    if (
      !declarations ||
      !declarations.noPurchased ||
      !declarations.noScraped ||
      !declarations.noUnsubscribed ||
      !declarations.suppressionListIdentified ||
      !declarations.consentPurpose?.trim()
    ) {
      return {
        success: false,
        error:
          'Complétez les déclarations de provenance : origine licite de la liste, absence d’adresses achetées ou collectées sur le Web, absence de désabonnés et finalité annoncée.',
      };
    }

    // Le parsing, la validation et la déduplication d'adresses se font côté
    // serveur Go : le navigateur ne doit pas décider de ce qui est importable,
    // et le service ne fait confiance ni à l'extension ni au type MIME.
    const batch = await goFetch<{
      id: string;
      status: string;
      stats: SubscriberImportStats;
    }>(`/v1/import/publications/${encodeURIComponent(publicationId)}/subscribers`, {
      method: 'POST',
      body: {
        source: options.source ?? 'csv_manual',
        sourceDetail: options.sourceDetail,
        collectionPeriod: options.collectionPeriod,
        optInMethod: options.optInMethod,
        lastSendAt: options.lastSendAt,
        declarations,
        content: csvContent,
      },
    });

    return { success: true, batchId: batch.id, status: batch.status, stats: batch.stats };
  } catch (err: unknown) {
    console.error('[CSV Import Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec du dépôt de la liste d'abonnés",
    };
  }
}
