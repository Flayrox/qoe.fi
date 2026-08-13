// =====================================================================
// 🗄️ @qoe/observability/server — Côté serveur uniquement
// =====================================================================
// 📖 Ré-exporte le module Redis cache (ioredis, server-only).
//    Utilisé par les repos DB, API et workers. Ne JAMAIS importer depuis
//    un composant client (ferait fuiter ioredis dans le bundle navigateur).
// =====================================================================

export * from './redis';
