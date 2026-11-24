'use server';

// =====================================================================
// 🎫 Actions du formulaire public (/support) — vitrine, sans compte requis
// =====================================================================
// Volontairement locales (pas de @qoe/sdk dans la vitrine : légère).
// Session hi si présente → Bearer joint → le backend ouvre le dossier AU
// COMPTE ; sinon sans Bearer → dossier invité (guest:<email>). Le backend
// distingue seul (auth optionnelle) — ici on ne fait que transmettre.
// Rate-limit Redis (5/h) + budget 3/j/adresse côté Go (429/409 explicites).
// =====================================================================
// L'action ne renvoie pas de copie : elle tourne hors du rendu (pas de
// catalogue actif garanti) et la langue de l'interface appartient au client.
// Elle renvoie un code, le formulaire le traduit.
// =====================================================================

import { createClient } from '@qoe/supabase/server';

const KINDS = [
  'account_restricted',
  'account_lost',
  'content_moderation',
  'api_access',
  'import_issue',
  'delivery',
  'report_issue',
  'other',
] as const;

export type SupportPublicError =
  'invalid_email' | 'missing_content' | 'unavailable' | 'rate_limited' | 'duplicate' | 'failed';

export type SupportPublicResult =
  { ok: true; id: string; account: boolean } | { ok: false; error: SupportPublicError };

async function accessToken(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  } catch {
    return '';
  }
}

export async function submitPublicTicket(input: {
  name: string;
  email: string;
  kind: string;
  subject: string;
  message: string;
}): Promise<SupportPublicResult> {
  const name = input.name.trim().slice(0, 100);
  const email = input.email.trim().toLowerCase();
  const kind = KINDS.includes(input.kind as (typeof KINDS)[number]) ? input.kind : 'other';
  const subject = input.subject.trim();
  const message = input.message.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }
  if (subject.length < 5 || message.length < 1) {
    return { ok: false, error: 'missing_content' };
  }

  const base = process.env.QOE_API_URL;
  if (!base) {
    return { ok: false, error: 'unavailable' };
  }
  const token = await accessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${base}/v1/support/public/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, email, kind, subject, message }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
  if (res.status === 429) {
    return { ok: false, error: 'rate_limited' };
  }
  if (res.status === 409) {
    return { ok: false, error: 'duplicate' };
  }
  if (!res.ok) {
    return { ok: false, error: 'failed' };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: typeof data.id === 'string' ? data.id : '', account: token !== '' };
}
