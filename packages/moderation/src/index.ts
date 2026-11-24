// =====================================================================
// 🛡️ @qoe/moderation — Gardes UI d'inscription (email & identité)
// =====================================================================
// Note : la modération synchrone et IA du contenu vit côté Go dans
// apps/api/internal/moderation (entonnoir unifié). Ce package conserve les
// validateurs clients d'email jetable et de pseudo réutilisés par apps/core.
// =====================================================================

export * from './email';
export * from './identity';
