import { describe, it, expect } from 'vitest';
import { routes } from '../routes';

describe('🗺️ packages/config/src/routes.ts', () => {
  it('studio routes inclut media, notifications, pricing, import', () => {
    expect(routes.studio.media()).toBe('/media');
    expect(routes.studio.notifications()).toBe('/notifications');
    expect(routes.studio.pricing()).toBe('/pricing');
    expect(routes.studio.import()).toBe('/import');
  });

  it('feed routes inclut messages', () => {
    expect(routes.feed.messages()).toBe('/messages');
    expect(routes.feed.messages('user-123')).toBe('/messages/user-123');
    expect(routes.feed.messages('foo bar')).toBe('/messages/foo%20bar');
  });
});
