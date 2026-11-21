// =====================================================================
// 📜 Téléchargement de l'export signé du registre des abonnés (Ed25519)
// =====================================================================
// Relaie le flux d'export scellé par l'API Go sans désérialisation
// intermédiaire pour préserver la signature Ed25519.
// Exige la capacité `admin.subscriptions.read` et un step-up N2 côté Go.
// =====================================================================

import type { NextRequest } from 'next/server';
import { goFetchRaw } from '@qoe/sdk/actions/utils/go-client';
import { getAdminIdentity, hasCapability } from '@/lib/admin-identity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const identity = await getAdminIdentity();
  if (!hasCapability(identity, 'admin.subscriptions.read')) {
    return new Response(
      JSON.stringify({ error: 'Accès refusé : la capacité admin.subscriptions.read est requise.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      }
    );
  }

  // Le corps reçu (formulaire ou JSON) est normalisé de la même façon : seuls
  // les quatre champs prévus passent, bornés. Sans ce filtre, la branche JSON
  // relayait n'importe quelle clé et des valeurs de taille arbitraire au Go.
  const boundary = (value: unknown): string =>
    typeof value === 'string' ? value.trim().slice(0, 200) : '';
  const toBody = (source: Record<string, unknown>): Record<string, string> => ({
    subject: boundary(source.subject),
    reason: typeof source.reason === 'string' ? source.reason.trim().slice(0, 500) : '',
    publisherId: typeof source.publisherId === 'string' ? source.publisherId.slice(0, 100) : '',
    status: typeof source.status === 'string' ? source.status.slice(0, 50) : '',
  });

  let body: Record<string, string>;
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const parsed: unknown = await request.json().catch(() => ({}));
    body = toBody(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {});
  } else {
    const form = await request.formData().catch(() => null);
    body = form
      ? toBody({
          subject: form.get('subject'),
          reason: form.get('reason'),
          publisherId: form.get('publisherId'),
          status: form.get('status'),
        })
      : toBody({});
  }

  let response;
  try {
    response = await goFetchRaw('/v1/admin/subscribers/signed-export', {
      method: 'POST',
      body,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Export d’abonnés signé indisponible',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const headers: Record<string, string> = {
    'Content-Type': response.contentType || 'application/json',
    'Cache-Control': 'no-store',
    'Content-Disposition':
      response.contentDisposition || `attachment; filename="qoe-abonnes-signe-${stamp}.json"`,
  };
  return new Response(response.text, { status: response.status, headers });
}
