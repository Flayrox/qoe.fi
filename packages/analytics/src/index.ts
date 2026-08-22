// =====================================================================
// 📦 @qoe/analytics — Re-exports
// =====================================================================

export { AnalyticsScript, useTrackEvent, trackEvent } from './client';
export {
  trackServerEvent,
  fetchUmamiWebsiteStats,
  fetchUmamiTopPages,
  fetchUmamiReferrers,
  fetchUmamiPageviewsSeries,
  fetchUmamiMetrics,
  type UmamiStats,
  type UmamiPageMetric,
  type UmamiTimeseriesPoint,
} from './server';
export { EVENTS, type EventName, type EventProps } from './events';
export {
  useArticleReadingTracker,
  resolveReadingProvenance,
  type ReadingSource,
  type ReadingStatus,
  type ReadingTrackerState,
  type UseArticleReadingTrackerProps,
} from './useArticleReadingTracker';
export { useFeedImpressionTracker, type FeedImpressionItem } from './useFeedImpressionTracker';
// NOTE : creator-analytics est server-only (importe @qoe/db complet).
// Exposé via `@qoe/analytics/queries` pour ne pas faire fuiter Prisma/Redis
// dans les bundles navigateur des composants client.
