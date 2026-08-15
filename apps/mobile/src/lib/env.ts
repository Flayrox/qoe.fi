// =====================================================================
// 🔐 ENV mobile — variables publiques EXPO_PUBLIC_ (inlinées par Expo CLI)
// =====================================================================
// Sources : apps/mobile/.env (développement) — valeurs publiques par nature
// (clé anon Supabase, mêmes valeurs que NEXT_PUBLIC_ côté web).
// =====================================================================

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};
