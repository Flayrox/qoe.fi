// =====================================================================
// 🔑 env — une variable d'environnement manquante doit être nommée
// =====================================================================
// Les clients Supabase recevaient `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!` :
// l'assertion promettait une clé que rien ne garantissait. Sans elle, le client
// se construisait avec `undefined` et l'échec surgissait bien plus loin, dans un
// message qui ne parlait plus de configuration. On échoue ici, en nommant la
// variable — et une valeur vide compte comme absente.
// =====================================================================

/**
 * Clé de service (privileges d'administration Auth). Absente = erreur nommée :
 * partir avec `undefined` ferait échouer l'appel ailleurs, sans dire pourquoi.
 */
export function requireSupabaseServiceRoleKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY manquante : le bannissement Auth exige la clé de service.'
    );
  }
  return key;
}

export function requireSupabaseAnonKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY manquante : la console ne peut pas authentifier sans clé anonyme.'
    );
  }
  return key;
}
