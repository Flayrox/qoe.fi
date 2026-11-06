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

  let body: Record<string, unknown> = {};
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await request.json().catch(() => ({}));
  } else {
    const form = await request.formData().catch(() => null);
    if (form) {
      body = {
        subject: String(form.get('subject') ?? '').slice(0, 200),
        reason: String(form.get('reason') ?? '').slice(0, 500),
        publicationId: String(form.get('publicationId') ?? '').slice(0, 100),
        status: String(form.get('status') ?? '').slice(0, 50),
      };
    }
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
