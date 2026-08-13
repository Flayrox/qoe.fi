// =====================================================================
// ⚙️ Workers — Background jobs runner
// =====================================================================
// 📖 BullMQ = file de jobs basée sur Redis pour Stripe, Newsletters, Meilisearch.
// =====================================================================

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { initSentryNode, logger } from '@qoe/observability';
import { processMeilisearchSyncJob, setupMeilisearch } from './jobs/meilisearchSync';
import { processStripeWebhookSyncJob } from './jobs/stripeWebhookSync';
import { processPublishNewsletterJob } from './jobs/publishNewsletterJob';

// Initialise Sentry (no-op silencieux sans SENTRY_DSN en dev local)
initSentryNode();

logger.info('qoe.fi workers — Démarrage...');

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 1000, 15000);
  },
});

let isRedisConnected = false;
connection.on('connect', () => {
  isRedisConnected = true;
  logger.info('Workers connecté à Redis');
});

connection.on('error', (err) => {
  if ((err as { code?: string })?.code === 'ECONNREFUSED') {
    if (!isRedisConnected) {
      logger.warn('Workers en attente de Redis', { url: '127.0.0.1:6379' });
    }
  } else {
    logger.error(
      'Workers erreur Redis',
      { message: (err as { message?: string }).message },
      { capture: true }
    );
  }
});

// Initialiser Meilisearch
setupMeilisearch();

// 1. Worker Meilisearch Search Index Sync
const searchWorker = new Worker('search-sync', processMeilisearchSyncJob, {
  connection: connection as unknown as import('bullmq').ConnectionOptions,
});

// 2. Worker Stripe Webhook Asynchronous Sync
const stripeWorker = new Worker('stripe-webhooks', processStripeWebhookSyncJob, {
  connection: connection as unknown as import('bullmq').ConnectionOptions,
});

// 3. Worker Bulk Newsletter Dispatch
const newsletterWorker = new Worker(
  'domain-events',
  async (job) => {
    if (job.name === 'ARTICLE_PUBLISHED') {
      await processPublishNewsletterJob(job as unknown as import('bullmq').Job);
    }
  },
  { connection: connection as unknown as import('bullmq').ConnectionOptions }
);

const allWorkers = [searchWorker, stripeWorker, newsletterWorker];

allWorkers.forEach((w) => {
  w.on('completed', (job) => {
    logger.info('Job terminé', { worker: w.name, jobId: job?.id });
  });

  w.on('failed', (job, err) => {
    logger.error('Job échoué', { worker: w.name, jobId: job?.id, err }, { capture: true });
  });
});

process.on('SIGTERM', async () => {
  logger.info('Workers: SIGTERM reçu, arrêt propre...');
  await Promise.all(allWorkers.map((w) => w.close()));
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Workers: SIGINT reçu, arrêt propre...');
  await Promise.all(allWorkers.map((w) => w.close()));
  process.exit(0);
});
