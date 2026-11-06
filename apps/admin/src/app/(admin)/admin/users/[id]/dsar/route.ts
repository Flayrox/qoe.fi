// =====================================================================
// 📦 Téléchargement de l'export personnel complet DSAR (Art. 15 / 20)
// =====================================================================
// Relaye le document produit par l'API Go sans re-sérialisation JSON,
// pour préserver le hachage d'intégrité SHA-256 (X-Qoe-DSAR-Hash).
// Capacité requise : admin.compliance.export (avec step-up N2 côté Go).
// =====================================================================

import type { NextRequest } from 'next/server';
import { goFetchRaw } from '@qoe/sdk/actions/utils/go-client';
import { getAdminIdentity, hasCapability } from '@/lib/admin-identity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const identity = await getAdminIdentity();
  if (!hasCapability(identity, 'admin.compliance.export')) {
    return new Response(
      JSON.stringify({ error: 'Accès refusé : la capacité admin.compliance.export est requise.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      }
    );
  }

  const { id } = await context.params;
  const form = await request.formData().catch(() => null);
  const reason = String(form?.get('reason') ?? '').slice(0, 500);

  let response;
  try {
    response = await goFetchRaw(`/v1/admin/users/${id}/dsar-export`, {
      method: 'POST',
      body: { reason: reason || undefined },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Export DSAR indisponible',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const headers: Record<string, string> = {
    'Content-Type': response.contentType || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Disposition':
      response.contentDisposition || `attachment; filename="dsar-${id}-${stamp}.json"`,
  };
  return new Response(response.text, { status: response.status, headers });
}
