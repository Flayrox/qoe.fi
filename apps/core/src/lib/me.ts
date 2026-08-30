import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { MeProfile } from './cached-queries';

const getStatus = (err: unknown): number | undefined =>
  err && typeof err === 'object' && 'status' in err
    ? (err as { status?: number }).status
    : undefined;

/**
 * GET /v1/me avec auto-réparation.
 *
 * Une session Supabase valid(*) mais dont la ligne `User` est absente en base
 * (login de démo via le panneau dev, compte créé dans Auth avant un reseed,
 * backup restauré…) fait renvoyer un 404 « Utilisateur introuvable » par Go.
 * On recrée alors la ligne via POST /v1/me/sync (qui lit les claims du JWT —
 * le même chemin que /auth/callback) puis on relit le profil.
 *
 * Tous les appels à /v1/me du backend reader doivent passer par ici pour ne
 * plus jamais laisser un « Utilisateur introuvable » crasher une page.
 */
export async function fetchMeProfile(): Promise<MeProfile> {
  try {
    return await goFetch<MeProfile>('/v1/me');
  } catch (err) {
    if (getStatus(err) === 404) {
      await goFetch<{ created: boolean }>('/v1/me/sync', { method: 'POST' });
      return goFetch<MeProfile>('/v1/me');
    }
    throw err;
  }
}
