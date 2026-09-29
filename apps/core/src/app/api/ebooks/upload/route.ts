// =====================================================================
// 📤 /api/ebooks/upload — import d'un EPUB personnel (fiche Plus P1)
// =====================================================================
// Pourquoi une route et pas une server action : un EPUB peut peser 20 Mo
// (les server actions sont bornées à 1 Mo par défaut) et le multipart n'a
// pas à traverser la sérialisation RSC. Le fichier ne fait que PASSER ici :
// il est relayé tel quel au backend Go, qui parse, borne et stocke — le
// brut est jeté (aucun fichier conservé côté app).
// Le quota (5 gratuits, illimités en Plus) et le refus explicite
// (EBOOK_QUOTA_EXCEEDED / EBOOK_DUPLICATE) viennent du Go, intacts.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { goFetchUpload } from '@qoe/sdk/actions/utils/go-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const incoming = await request.formData();
  const file = incoming.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Champ 'file' requis (EPUB)" }, { status: 400 });
  }

  // Re-sérialisation explicite : on ne relaie QUE le fichier (jamais les
  // autres champs du formulaire client — la route est l'unique porte).
  const outbound = new FormData();
  outbound.set('file', file, file.name || 'livre.epub');

  try {
    const book = await goFetchUpload<Record<string, unknown>>('/v1/me/ebooks', outbound);
    return NextResponse.json(book, { status: 201 });
  } catch (err) {
    const e = err as { status?: number; message?: string; code?: string };
    // Statut et code du Go relayés tels quels (le front branche sur `code`).
    return NextResponse.json(
      { error: e.message || 'Import impossible', ...(e.code ? { code: e.code } : {}) },
      { status: e.status ?? 500 }
    );
  }
}
