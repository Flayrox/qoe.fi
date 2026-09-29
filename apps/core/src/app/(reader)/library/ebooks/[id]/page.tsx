import { createClient } from '@qoe/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { EbookDetail, EbookNote } from '@qoe/sdk';
import { EbookReader } from './EbookReader';

// =====================================================================
// 📖 Lire un EPUB personnel (fiche Plus P1)
// =====================================================================
// Les chapitres sont déjà du HTML STRICT (allowlist du parseur Go : p,
// h1-h6, blockquote, listes, em/strong/br + texte — scripts, styles,
// iframes, images et handlers jamais stockés). Le rendu est donc sûr par
// construction, pas par filtrage à l'affichage.
// =====================================================================

export default async function EbookReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ chapter?: string }>;
}) {
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

  // Notes chargées AVEC le livre : pas de flash vide, pas de requête en
  // cascade côté client au premier rendu. Les droits (Plus) décident de
  // l'écoute et de l'emport hors-ligne — même source que les autres gates.
  const [notes, entitlements, query] = await Promise.all([
    goFetch<{ items: EbookNote[] }>(`/v1/me/ebooks/${encodeURIComponent(id)}/notes`).catch(() => ({
      items: [] as EbookNote[],
    })),
    goFetch<{ plus: boolean }>('/v1/me/entitlements').catch(() => ({ plus: false })),
    searchParams ?? Promise.resolve(undefined),
  ]);

  // Chapitre demandé explicitement (clic depuis « mes notes ») : la page
  // s'ouvre sur le bon chapitre, pas sur la progression mémorisée.
  const requested = Number.parseInt(query?.chapter ?? '', 10);
  const initialChapter = Number.isFinite(requested) && requested >= 0 ? requested : undefined;

  return (
    <EbookReader
      book={book}
      initialNotes={notes.items ?? []}
      plus={entitlements.plus === true}
      initialChapter={initialChapter}
    />
  );
}
