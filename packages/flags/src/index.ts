// =====================================================================
// 📦 @qoe/flags — Feature flags typés généralisés au monorepo
// =====================================================================
// 📖 Entrée client-safe (React). Le serveur est dans `@qoe/flags/server`.
//
// 🎯 Consommation :
//    // client (composant)
//    import { useFlag } from '@qoe/flags';
//    const showRecos = useFlag('feed-recommendations');
//
//    // optionnel : layout client provider
//    import { FlagsProvider } from '@qoe/flags';
//    <FlagsProvider flags={flags}>…
// =====================================================================

export * from './flags';
export { FlagsProvider, GrowthBookProvider } from './provider';
export { useFlag, useFlagIsOn, useFlags, useGrowthBook } from './hooks';
