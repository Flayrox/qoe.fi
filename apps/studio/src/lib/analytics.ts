'use client';

// Abstract analytics wrapper to prepare the ground for Umami & PostHog
interface UmamiWindow extends Window {
  umami?: { track: (eventName: string, properties?: Record<string, unknown>) => void };
}
interface PosthogWindow extends Window {
  posthog?: { capture: (eventName: string, properties?: Record<string, unknown>) => void };
}

export const trackServerEvent = (eventName: string, properties?: Record<string, unknown>) => {
  // 1. Umami (public metrics, cookie-less)
  if (typeof window !== 'undefined' && (window as UmamiWindow).umami) {
    try {
      (window as UmamiWindow).umami?.track(eventName, properties);
    } catch (e) {
      console.warn('Umami tracking failed:', e);
    }
  }

  // 2. PostHog (heavy product analytics)
  if (typeof window !== 'undefined' && (window as PosthogWindow).posthog) {
    try {
      (window as PosthogWindow).posthog?.capture(eventName, properties);
    } catch (e) {
      console.warn('PostHog tracking failed:', e);
    }
  }

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Analytics] Event tracked: "${eventName}"`, properties);
  }
};
