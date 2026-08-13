import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

// Reuse the redis connection across the queue instance to avoid too many connections
// Uses NEXT_PUBLIC_REDIS_URL or REDIS_URL depending on standard setup
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const searchQueue = new Queue('search-sync', {
  connection: connection as ConnectionOptions,
});
