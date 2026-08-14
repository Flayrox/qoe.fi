import { z } from 'zod';

export const ArticlePublishedEventSchema = z.object({
  eventId: z.string(),
  publicationId: z.string(),
  articleId: z.string(),
  authorId: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  visibility: z.enum(['PUBLIC', 'MEMBERS_ONLY', 'PAID_SUBSCRIBERS', 'TIER_SPECIFIC']),
  publishedAt: z.string(),
});

export const PostLikedEventSchema = z.object({
  eventId: z.string(),
  postId: z.string(),
  userId: z.string().uuid(),
  authorId: z.string().uuid(),
  createdAt: z.string(),
});

export const SubscriberCreatedEventSchema = z.object({
  eventId: z.string(),
  subscriberId: z.string(),
  publicationId: z.string(),
  creatorId: z.string().uuid(),
  email: z.string().email(),
  isPremium: z.boolean().default(false),
  createdAt: z.string(),
});

export const PaywallHitEventSchema = z.object({
  eventId: z.string(),
  articleId: z.string(),
  creatorId: z.string().uuid(),
  readerEmail: z.string().optional(),
  visibility: z.enum(['MEMBERS_ONLY', 'PAID_SUBSCRIBERS', 'TIER_SPECIFIC']),
  timestamp: z.string(),
});

export type ArticlePublishedEvent = z.infer<typeof ArticlePublishedEventSchema>;
export type PostLikedEvent = z.infer<typeof PostLikedEventSchema>;
export type SubscriberCreatedEvent = z.infer<typeof SubscriberCreatedEventSchema>;
export type PaywallHitEvent = z.infer<typeof PaywallHitEventSchema>;
