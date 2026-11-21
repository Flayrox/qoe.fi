// =====================================================================
// 🧪 clé anonyme Supabase — absence = erreur nommée, pas `undefined`
// =====================================================================
// `createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, …)` :
// l'assertion non-nulle promettait une variable que rien ne garantissait. Sans
// clé, le client se construisait avec `undefined` et l'authentification
// échouait plus loin sur un message incompréhensible (ou pire, silencieusement).
// La configuration manquante doit être dite à l'endroit où elle manque.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { requireSupabaseAnonKey } from '../env';

describe('requireSupabaseAnonKey', () => {
  it('rend la clé quand elle est configurée', () => {
    expect(requireSupabaseAnonKey('example-anon-key')).toBe('example-anon-key');
  });

  it('nomme la variable manquante quand elle est absente', () => {
    expect(() => requireSupabaseAnonKey(undefined)).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('refuse une valeur vide comme une absence', () => {
    expect(() => requireSupabaseAnonKey('   ')).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
