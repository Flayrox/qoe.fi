// =====================================================================
// ⚙️ Workers — Background jobs runner
// =====================================================================
// 📖 BullMQ = file de jobs basée sur Redis. Plus robuste que node-cron.
//
// 🎯 Workers prévus (à implémenter en Phase 5) :
//    - embeddings  : génère les vecteurs pgvector pour les articles/posts
//    - emails      : envois newsletters, notifications, confirmations
//    - billing     : Stripe webhooks async, payouts, commissions
//    - search      : re-indexation Meilisearch
//
// Ce fichier est le point d'entrée qui démarre tous les workers.
// =====================================================================

console.log("⚙️ qoe.fi workers — placeholder");
console.log("   Sera implémenté en Phase 5.");
console.log("   Workers prévus : embeddings, emails, billing, search");

// Garde le process actif jusqu'à SIGTERM/SIGINT
// (évite que Docker redémarre le container en boucle)
process.on("SIGTERM", () => {
  console.log("⚙️ Workers: SIGTERM reçu, arrêt propre...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("⚙️ Workers: SIGINT reçu, arrêt propre...");
  process.exit(0);
});

// Heartbeat toutes les 30s pour indiquer que le worker tourne
setInterval(() => {
  console.log("⚙️ Workers: en attente de tâches (Phase 5)...");
}, 30_000);

