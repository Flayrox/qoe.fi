// =====================================================================
// 🖼️ /api/ebooks/[id]/cover — couverture d'un EPUB personnel
// =====================================================================
// La couverture reste PRIVÉE (bibliothèque strictement personnelle) : elle
// est relue côté serveur avec le jeton de la session, jamais servie par une
// URL publique. Un livre d'autrui répond 404 (le Go ne distingue pas
// inexistant et pas-à-vous — pas de fuite d'existence).
// Cache navigateur long : l'en-tête est immuable par id (un réimport crée
// une AUTRE ligne) ; le `private` empêche tout cache partagé.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { goFetchBinary } from '@qoe/sdk/actions/utils/go-client';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new NextResponse(null, { status: 401 });
  }

  const { id } = await params;
  try {
    const res = await goFetchBinary(`/v1/me/ebooks/${encodeURIComponent(id)}/cover`);
    if (!res.ok) {
      return new NextResponse(null, { status: res.status === 404 ? 404 : res.status });
    }
    return new NextResponse(res.bytes, {
      status: 200,
      headers: {
        'Content-Type': res.contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
