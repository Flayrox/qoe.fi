// =====================================================================
// ⚙️ Workers — Background jobs runner
// =====================================================================
// 📖 BullMQ = file de jobs basée sur Redis. Plus robuste que node-cron.
// =====================================================================

import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processMeilisearchSyncJob, setupMeilisearch } from "./jobs/meilisearchSync";

console.log("⚙️ qoe.fi workers — Démarrage...");

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 1000, 15000);
  },
});

let isRedisConnected = false;
connection.on("connect", () => {
  isRedisConnected = true;
  console.log("⚙️ [Workers] Connecté à Redis avec succès.");
});

connection.on("error", (err: any) => {
  if (err?.code === "ECONNREFUSED") {
    if (!isRedisConnected) {
      console.warn("⚠️ [Workers] En attente de Redis sur 127.0.0.1:6379 (Démarre Docker/Redis avec `docker compose -f docker-compose.dev.yml up -d db redis meilisearch`)");
    }
  } else {
    console.error("❌ [Workers] Erreur Redis:", err.message);
  }
});

// Initialiser Meilisearch
setupMeilisearch();

const searchWorker = new Worker("search-sync", processMeilisearchSyncJob, { connection: connection as any });

searchWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} terminé avec succès.`);
});

searchWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} a échoué:`, err);
});

process.on("SIGTERM", async () => {
  console.log("⚙️ Workers: SIGTERM reçu, arrêt propre...");
  await searchWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("⚙️ Workers: SIGINT reçu, arrêt propre...");
  await searchWorker.close();
  process.exit(0);
});
