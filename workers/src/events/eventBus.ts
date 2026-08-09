import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  ArticlePublishedEvent,
  ArticlePublishedEventSchema,
  PostLikedEvent,
  PostLikedEventSchema,
  SubscriberCreatedEvent,
  SubscriberCreatedEventSchema,
  PaywallHitEvent,
  PaywallHitEventSchema,
} from "./eventSchemas";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const eventsQueue = new Queue("domain-events", {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 },
  },
});

export const eventBus = {
  async publishArticlePublished(event: ArticlePublishedEvent) {
    const validated = ArticlePublishedEventSchema.parse(event);
    await eventsQueue.add("ARTICLE_PUBLISHED", validated, {
      jobId: `article_published_${validated.articleId}`,
    });
  },

  async publishPostLiked(event: PostLikedEvent) {
    const validated = PostLikedEventSchema.parse(event);
    await eventsQueue.add("POST_LIKED", validated, {
      jobId: `post_liked_${validated.postId}_${validated.userId}`,
    });
  },

  async publishSubscriberCreated(event: SubscriberCreatedEvent) {
    const validated = SubscriberCreatedEventSchema.parse(event);
    await eventsQueue.add("SUBSCRIBER_CREATED", validated, {
      jobId: `sub_created_${validated.subscriberId}`,
    });
  },

  async publishPaywallHit(event: PaywallHitEvent) {
    const validated = PaywallHitEventSchema.parse(event);
    await eventsQueue.add("PAYWALL_HIT", validated);
  },
};
