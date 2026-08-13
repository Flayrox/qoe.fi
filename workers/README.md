# `@qoe/workers`

**Role:** Dedicated asynchronous processor using BullMQ and Redis. It manages heavy computational processes out-of-band to prevent timeout faults in Server Actions.

## File Exhaustive Listing

- `package.json`
- `tsconfig.json`
- `tsup.config.ts`
- `Dockerfile`
- `src/index.ts`
- `src/scheduled-publisher.ts`
- `src/events/eventBus.ts`
- `src/events/eventSchemas.ts`
- `src/jobs/meilisearchSync.ts`
- `src/jobs/newsletter-fanout.ts`
- `src/jobs/publishNewsletterJob.ts`
- `src/jobs/stripeWebhookSync.ts`

## Key Function Signatures

```typescript
// eventBus.ts
export const eventBus: {
  publishArticlePublished(event: ArticlePublishedEvent): Promise<void>;
  publishPostLiked(event: PostLikedEvent): Promise<void>;
  // ...
};

// meilisearchSync.ts
export async function processMeilisearchSyncJob(
  job: Job<SyncJobData>
): Promise<{ success: boolean; action: string }>;
```
