import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { EbookSummary } from '@qoe/sdk';
import { EbooksClient } from './EbooksClient';

// =====================================================================
// 📚 Mes livres — bibliothèque d'EPUBs personnels (fiche Plus P1)
// =====================================================================
// Liste + quota récupérés côté serveur (Go backend-of-record) : le client
// n'a jamais le jeton Go, et la bibliothèque reste strictement privée.
// =====================================================================

export default async function LibraryEbooksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [listing, entitlements] = await Promise.all([
    goFetch<{ items: EbookSummary[] }>('/v1/me/ebooks?limit=100').catch(() => ({
      items: [] as EbookSummary[],
    })),
    goFetch<{ plus: boolean }>('/v1/me/entitlements').catch(() => ({ plus: false })),
  ]);

  return <EbooksClient initialEbooks={listing.items ?? []} plus={entitlements.plus === true} />;
}
