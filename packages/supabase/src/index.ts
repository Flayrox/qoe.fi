// =====================================================================
// 📦 @qoe/supabase — Re-exports
// =====================================================================

// Note: server et middleware doivent être importés depuis leur fichier
// car ils dépendent de next/headers et sont "server-only".
export * from './client';
export * from './sso';
export * from './broadcast';
export * from './cookie-config';
export * from './storage';
// ⚠️ media-engine est volontairement EXCLU du barrel : il importe sharp
//    (lib native Node) et serait tiré dans les bundles client via
//    n'importe quel import du barrel. Utiliser le sous-chemin direct :
//    import ... from '@qoe/supabase/media-engine' (côté serveur uniquement).
