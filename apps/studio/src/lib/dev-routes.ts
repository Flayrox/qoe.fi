// =====================================================================
// 🚪 dev-routes — une seule décision pour les pages `/dev/**`
// =====================================================================
// Ces pages n'existent qu'en local… sauf dans le build de production que le
// job E2E sert avec `next start` : il pose `QOE_E2E_DEV_ROUTES=1` pour
// exposer le banc d'éditeur et le UI Lab. Le middleware et les trois pages
// doivent lire la MÊME règle : quand elles divergeaient, le lab et `/dev`
// rendaient 404 dans un build où `/dev/editor-check` répondait.
// =====================================================================

export function devRoutesEnabled(
  env: { NODE_ENV?: string; QOE_E2E_DEV_ROUTES?: string } = process.env
): boolean {
  return env.NODE_ENV !== 'production' || env.QOE_E2E_DEV_ROUTES === '1';
}
