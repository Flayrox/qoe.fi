import { createClient } from '@qoe/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { EbookDetail } from '@qoe/sdk';
import { EbookReader } from './EbookReader';

// =====================================================================
// 📖 Lire un EPUB personnel (fiche Plus P1)
// =====================================================================
// Les chapitres sont déjà du HTML STRICT (allowlist du parseur Go : p,
// h1-h6, blockquote, listes, em/strong/br + texte — scripts, styles,
// iframes, images et handlers jamais stockés). Le rendu est donc sûr par
// construction, pas par filtrage à l'affichage.
// =====================================================================

export default async function EbookReadPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { id } = await params;
  let book: EbookDetail;
  try {
    book = await goFetch<EbookDetail>(`/v1/me/ebooks/${encodeURIComponent(id)}`);
  } catch (err) {
    // 404 = inexistant ou pas à vous (le Go ne distingue pas — pas de fuite).
    if ((err as { status?: number })?.status === 404) notFound();
    throw err;
  }

  return <EbookReader book={book} />;
}
