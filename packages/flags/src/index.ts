// =====================================================================
// 📦 @qoe/flags — Feature flags (GrowthBook) généralisés au monorepo
// =====================================================================
// 📖 Entrée client-safe (React). Le serveur est dans `@qoe/flags/server`.
//
// 🎯 Consommation :
//    // client (composant)
//    import { useFlag } from '@qoe/flags';
//    const showRecos = useFlag('feed-recommendations');
//
//    // layout (Server Component)
//    import { GrowthBookProvider } from '@qoe/flags';
//    import { getGrowthBookPayload } from '@qoe/flags/server';
//    const payload = await getGrowthBookPayload();
//    <GrowthBookProvider payload={payload}>…
// =====================================================================

export * from './flags';
export { GrowthBookProvider } from './provider';
export { useFlag, useFlagIsOn, useFlags, useGrowthBook } from './hooks';
