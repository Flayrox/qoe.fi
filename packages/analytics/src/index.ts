// =====================================================================
// 📦 @qoe/analytics — Re-exports
// =====================================================================

export { AnalyticsScript, useTrackEvent, trackEvent } from "./client";
export {
  trackServerEvent,
  fetchUmamiWebsiteStats,
  fetchUmamiTopPages,
  fetchUmamiReferrers,
  fetchUmamiPageviewsSeries,
  fetchUmamiMetrics,
  type UmamiStats,
  type UmamiPageMetric,
  type UmamiTimeseriesPoint
} from "./server";
export { EVENTS, type EventName, type EventProps } from "./events";
export * from "./queries/creator-analytics";
