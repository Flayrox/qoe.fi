'use client';

// Abstract analytics wrapper to prepare the ground for Umami & PostHog
export const trackServerEvent = (eventName: string, properties?: Record<string, unknown>) => {
  const umami =
    typeof window !== 'undefined'
      ? (window as unknown as { umami?: { track: (name: string, props?: unknown) => void } }).umami
      : undefined;
  const posthog =
    typeof window !== 'undefined'
      ? (window as unknown as { posthog?: { capture: (name: string, props?: unknown) => void } })
          .posthog
      : undefined;

  // 1. Umami (public metrics, cookie-less)
  if (umami) {
    try {
      umami.track(eventName, properties);
    } catch (e) {
      console.warn('Umami tracking failed:', e);
    }
  }

  // 2. PostHog (heavy product analytics)
  if (posthog) {
    try {
      posthog.capture(eventName, properties);
    } catch (e) {
      console.warn('PostHog tracking failed:', e);
    }
  }

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Analytics] Event tracked: "${eventName}"`, properties);
  }
};

export const trackEvent = trackServerEvent;
