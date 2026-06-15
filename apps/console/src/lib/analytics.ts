"use client"

// Abstract analytics wrapper to prepare the ground for Umami & PostHog
export const trackServerEvent = (
  eventName: string,
  properties?: Record<string, any>
) => {
  // 1. Umami (public metrics, cookie-less)
  if (typeof window !== "undefined" && (window as any).umami) {
    try {
      (window as any).umami.track(eventName, properties)
    } catch (e) {
      console.warn("Umami tracking failed:", e)
    }
  }

  // 2. PostHog (heavy product analytics)
  if (typeof window !== "undefined" && (window as any).posthog) {
    try {
      (window as any).posthog.capture(eventName, properties)
    } catch (e) {
      console.warn("PostHog tracking failed:", e)
    }
  }

  // Development logging
  if (process.env.NODE_ENV === "development") {
    console.log(`[Analytics] Event tracked: "${eventName}"`, properties)
  }
}
