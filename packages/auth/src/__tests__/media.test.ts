import { describe, expect, it } from 'vitest';
import { canMedia, MEDIA_ROLE_PERMISSIONS } from '../media';

describe('permissions média — analytics', () => {
  it('refuse media:view_analytics à un viewer (parité Go)', () => {
    expect(canMedia({ role: 'viewer', status: 'active' }, 'media:view_analytics')).toBe(false);
  });

  it('autorise owner et editor', () => {
    expect(canMedia({ role: 'owner', status: 'active' }, 'media:view_analytics')).toBe(true);
    expect(canMedia({ role: 'editor', status: 'active' }, 'media:view_analytics')).toBe(true);
  });

  it('honore un override explicite sur un viewer', () => {
    expect(
      canMedia(
        { role: 'viewer', status: 'active', permissions: ['media:view_analytics'] },
        'media:view_analytics'
      )
    ).toBe(true);
  });

  it('ignore une invitation en attente', () => {
    expect(canMedia({ role: 'owner', status: 'invited' }, 'media:view_analytics')).toBe(false);
  });

  it('ne donne aucune permission de base au viewer', () => {
    expect(MEDIA_ROLE_PERMISSIONS.viewer).toEqual([]);
  });
});
