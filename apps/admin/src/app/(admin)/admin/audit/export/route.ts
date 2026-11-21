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
  // Sans jeton, le Go refuserait de toute façon : on le dit ici plutôt que
  // d'envoyer un « Bearer » vide et de relayer un 401 opaque.
  const accessToken = session?.access_token;
  if (!accessToken) {
    return new NextResponse('Session expirée : reconnectez-vous pour exporter.', { status: 401 });
  }

  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.set('format', 'csv');
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/v1/admin/audit-log?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(goTimeoutMs()),
    });
  } catch (error) {
    // Réseau coupé ou délai dépassé : sans ce garde, l'exception remontait
    // brute (500 sans corps) au lieu d'une erreur lisible.
    console.error('Export audit indisponible:', error);
    return new NextResponse('Export impossible : le service d’audit ne répond pas.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return new NextResponse(body || `Export impossible (${response.status})`, {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
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
