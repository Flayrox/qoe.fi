'use client';

import { trackEvent as trackUmamiEvent } from '@qoe/analytics/client';

declare global {
  interface Window {
    posthog?: { capture: (name: string, props?: unknown) => void };
  }
}

// Wrapper analytics unifié : délègue Umami à @qoe/analytics/client et conserve PostHog si présent.
export const trackServerEvent = (eventName: string, properties?: Record<string, unknown>) => {
  // 1. Umami (public metrics, cookie-less)
  trackUmamiEvent(eventName, properties);

  // 2. PostHog (heavy product analytics)
  const posthog = typeof window !== 'undefined' ? window.posthog : undefined;
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
