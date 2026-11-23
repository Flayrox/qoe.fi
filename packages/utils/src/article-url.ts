// =====================================================================
// 🔗 URLs publiques des articles — ré-export de la source unique.
// =====================================================================
// 📖 L'implémentation vit dans `@qoe/config/article-url` : `@qoe/config` est le
//    paquet le plus bas et ses `routes` doivent composer les mêmes chemins,
//    alors que `@qoe/utils` dépend de `@qoe/config` (l'inverse serait un
//    cycle). Ce ré-export garde l'API historique `@qoe/utils`
//    (`buildArticlePath`, `buildCategoryPath`, `resolveCategoryPath`) sans
//    deuxième implémentation à maintenir.
// =====================================================================

export * from '@qoe/config/article-url';
