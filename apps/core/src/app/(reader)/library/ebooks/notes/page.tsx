import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { EbookNoteRef } from '@qoe/sdk';
import { AllNotesClient } from './AllNotesClient';

// =====================================================================
// 🗂️ Toutes mes notes de livres — un seul endroit
// =====================================================================
// Vue transversale (tous livres confondus) : le serveur renvoie tout ce
// qu'il a (borne de scan : 500), le filtrage fin se fait à la frappe côté
// client — pas de requête par caractère. `truncated` est affiché tel quel
// quand la borne mord : jamais de silence sur une limite.
// =====================================================================

export default async function AllEbookNotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const data = await goFetch<{ items: EbookNoteRef[]; total: number; truncated: boolean }>(
    '/v1/me/ebook-notes'
  ).catch(() => ({ items: [] as EbookNoteRef[], total: 0, truncated: false }));

  return <AllNotesClient initialNotes={data.items ?? []} truncated={data.truncated === true} />;
}
