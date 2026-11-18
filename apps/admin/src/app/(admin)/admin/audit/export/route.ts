// =====================================================================
// ⬇️ /admin/audit/export — le CSV sort du SERVEUR
// =====================================================================
// L'export est produit par le backend Go (`?format=csv`) : mêmes filtres, même
// autorisation, mêmes colonnes que l'écran. Ce handler n'est qu'un passe-plat
// authentifié — il revérifie la capacité côté interface (défense en profondeur)
// puis transmet le jeton de session au Go, qui reste le seul juge.
//
// `goFetch` ne convient pas ici : il désérialise du JSON et perdrait le CSV.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { goApiUrl, goTimeoutMs } from '@qoe/sdk/actions/utils/go-client';
import { getAdminIdentity, hasCapability } from '@/lib/admin-identity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const identity = await getAdminIdentity();
  if (!hasCapability(identity, 'admin.audit.read')) {
    return new NextResponse('Refusé : la capacité admin.audit.read est requise.', { status: 403 });
  }
  // Lue à l'appel (et non capturée à l'import) : une bascule d'environnement
  // ne doit pas laisser une origine périmée dans le processus.
  const apiUrl = goApiUrl();
  if (!apiUrl) {
    return new NextResponse('API Go non configurée.', { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.set('format', 'csv');
  const response = await fetch(`${apiUrl}/v1/admin/audit-log?${params.toString()}`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(goTimeoutMs()),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return new NextResponse(body || `Export impossible (${response.status})`, {
      status: response.status,
    });
  }

  return new NextResponse(await response.text(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-console.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
