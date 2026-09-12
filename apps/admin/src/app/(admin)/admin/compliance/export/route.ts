// =====================================================================
// 🧾 Téléchargement de l'export signé du registre de consentement
// =====================================================================
// Cette route existe pour UNE raison : ne pas laisser le framework
// re-sérialiser la pièce. La signature porte sur les octets exacts du
// document produit par l'API Go ; un aller-retour JSON→objet→JSON casserait
// l'empreinte et rendrait la preuve invérifiable. On relaie donc le corps
// tel quel, en-têtes compris.
//
// Route handler = pas de layout : la garde est celle de l'API Go (403 si
// l'appelant n'est pas superadmin), pas une vérification d'affichage.
// =====================================================================

import type { NextRequest } from 'next/server';
import { goFetchRaw } from '@qoe/sdk/actions/utils/go-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);

  const subject = String(form?.get('subject') ?? '').slice(0, 200);
  const reason = String(form?.get('reason') ?? '').slice(0, 500);
  const slug = String(form?.get('slug') ?? '').slice(0, 120);
  const userId = String(form?.get('userId') ?? '').slice(0, 64);
  const from = String(form?.get('from') ?? '').slice(0, 40);
  const to = String(form?.get('to') ?? '').slice(0, 40);

  const filters: Record<string, string> = {};
  if (slug) filters.slug = slug;
  if (userId) filters.userId = userId;
  if (from) filters.from = from;
  if (to) filters.to = to;

  let response;
  try {
    response = await goFetchRaw('/v1/admin/legal/consent-exports', {
      method: 'POST',
      body: { subject, reason, filters },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Export indisponible',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const headers: Record<string, string> = {
    'Content-Type': response.contentType,
    'Cache-Control': 'no-store',
    // Relaie le nom de fichier de l'API ; à défaut, on en fabrique un.
    'Content-Disposition':
      response.contentDisposition || `attachment; filename="qoe-consentements-${stamp}.json"`,
  };
  return new Response(response.text, { status: response.status, headers });
}
