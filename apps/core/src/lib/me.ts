import { fetchMeWithSync } from '@qoe/sdk/actions/utils/go-client';
import type { MeProfile } from './cached-queries';

/**
 * GET /v1/me avec auto-réparation via le helper centralisé du SDK.
 *
 * Une session Supabase valide mais dont la ligne `User` est absente en base
 * fait renvoyer un 404 par Go. fetchMeWithSync recrée alors la ligne via
 * POST /v1/me/sync puis relit le profil.
 */
export async function fetchMeProfile(): Promise<MeProfile> {
  return fetchMeWithSync<MeProfile>();
}
