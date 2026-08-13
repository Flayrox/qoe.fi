// =====================================================================
// 🔐 Auth Helpers — apps/api tests
// =====================================================================
// 📖 Reflète les DEUX surfaces d'auth de l'API :
//    - Creator API : Bearer token d'API key `qoe_live_...`
//    - Client/Mobile API : Bearer JWT Supabase
// =====================================================================

import { hashApiKey } from './memory-db';

export const CREATOR_API_KEY = 'qoe_live_test_creator_key_123';
export const CREATOR_API_KEY_HASH = hashApiKey(CREATOR_API_KEY);

export const CLIENT_JWT = 'fake-supabase-jwt-client';

export function creatorHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${CREATOR_API_KEY}` };
}

export function clientHeaders(jwt = CLIENT_JWT): Record<string, string> {
  return { Authorization: `Bearer ${jwt}` };
}
