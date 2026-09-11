'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { revalidatePath } from 'next/cache';
import DOMPurify from 'isomorphic-dompurify';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
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

    if (!rssUrl || !rssUrl.startsWith('http')) {
      return { success: false, error: 'URL de flux RSS invalide' };
    }

    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'qoe-fi-importer/1.0 (+https://qoe.fi)',
      },
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Impossible de récupérer le flux RSS (Statut ${res.status})`,
      };
    }

    const xmlText = await res.text();

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
 * 👥 Importer des abonnés depuis un fichier CSV (Substack, Ghost, Beehiiv).
 */
export async function importSubscribersCsvAction(csvContent: string) {
  try {
    const creator = await getAuthenticatedCreator();
    const publicationId = await getActivePublicationId(creator.id);

    if (!csvContent || !csvContent.trim()) {
      return { success: false, error: 'Fichier CSV vide' };
    }

    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return { success: false, error: 'Aucune ligne détectée dans le fichier' };
    }

    // Determine email column index if header exists
    let emailColIdx = 0;
    const header = lines[0]
      .toLowerCase()
      .split(/[,;\t]/)
      .map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const foundIdx = header.findIndex(
      (col) => col === 'email' || col === 'email address' || col === 'adresse email'
    );
    if (foundIdx !== -1) {
      emailColIdx = foundIdx;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailsToImport = new Set<string>();

    const startIndex = foundIdx !== -1 ? 1 : 0;
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ''));
      const candidate = parts[emailColIdx] || parts.find((p) => emailRegex.test(p));
      if (candidate && emailRegex.test(candidate.toLowerCase())) {
        emailsToImport.add(candidate.toLowerCase());
      }
    }

    if (emailsToImport.size === 0) {
      return { success: false, error: 'Aucune adresse email valide trouvée dans le fichier CSV' };
    }

    // Batch register subscribers via Go API
    let imported = 0;
    for (const email of emailsToImport) {
      try {
        await goFetch('/v1/home/subscribe', {
          method: 'POST',
          body: { email, publicationId },
        });
        imported++;
      } catch {
        // Continue with next email
      }
    }

    revalidatePath('/audience');
    return { success: true, count: imported };
  } catch (err: unknown) {
    console.error('[CSV Import Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec de l'importation des abonnés",
    };
  }
}
