'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActivePublisherId } from '@/lib/active-workspace';

async function getAuthenticatedCreator() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Non authentifié');

  return authUser;
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
    const publisherId = await getActivePublisherId(creator.id);

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
    }>(`/v1/import/publishers/${encodeURIComponent(publisherId)}/subscribers`, {
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
