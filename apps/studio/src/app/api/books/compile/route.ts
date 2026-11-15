// =====================================================================
// 📚 /api/books/compile — relais authentifié vers le compilateur Go
// =====================================================================
// Le front envoie titre + articles ; Go vérifie la propriété et renvoie
// l'EPUB. Aucune donnée n'est écrite ici.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  const apiUrl = process.env.QOE_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: 'API indisponible' }, { status: 503 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || !Array.isArray(payload.articleIds) || payload.articleIds.length === 0) {
    return NextResponse.json({ error: 'Articles requis' }, { status: 400 });
  }

  const upstream = await fetch(`${apiUrl}/v1/creator/books/compile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      title: payload.title,
      author: payload.author,
      articleIds: payload.articleIds,
    }),
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Compilation impossible' }, { status: upstream.status });
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition':
        upstream.headers.get('Content-Disposition') ?? 'attachment; filename="livre.epub"',
      'Cache-Control': 'no-store',
    },
  });
}
