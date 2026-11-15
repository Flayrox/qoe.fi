// =====================================================================
// ⬇️ /api/export — relais authentifié vers l'archive Go
// =====================================================================
// Une server action ne peut pas streamer un ZIP : ce route handler garde la
// session, résout le workspace actif et relaie l'archive produite par Go.
// Aucune donnée n'est écrite ici.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { getActiveWorkspace } from '@/lib/active-workspace';

export async function GET() {
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

  const workspace = await getActiveWorkspace(session.user.id);
  const upstream = await fetch(
    `${apiUrl}/v1/creator/export?publisherId=${encodeURIComponent(workspace.publisherId)}`,
    { headers: { Authorization: `Bearer ${session.access_token}` } }
  );

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Export impossible' }, { status: upstream.status });
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition':
        upstream.headers.get('Content-Disposition') ?? 'attachment; filename="qoe-export.zip"',
      'Cache-Control': 'no-store',
    },
  });
}
