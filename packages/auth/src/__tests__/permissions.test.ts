import { describe, expect, it } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import { ROLES } from '@qoe/config';
import { can, canEditArticle, canManageTenant, require, PermissionError } from '../permissions';

describe('@qoe/auth - Permissions System', () => {
  it('should allow superadmin to execute any action', () => {
    expect(can(ROLES.SUPERADMIN, 'article:create')).toBe(true);
    expect(can(ROLES.SUPERADMIN, 'admin:config:edit')).toBe(true);
    expect(can(ROLES.SUPERADMIN, 'billing:refund:any')).toBe(true);
  });

  it('should allow creator to manage own articles but not admin actions', () => {
    expect(can(ROLES.CREATOR, 'article:create')).toBe(true);
    expect(can(ROLES.CREATOR, 'article:edit:own')).toBe(true);
    expect(can(ROLES.CREATOR, 'admin:config:edit')).toBe(false);
  });

  it('should prevent normal user from creating articles', () => {
    expect(can(ROLES.USER, 'article:create')).toBe(false);
    expect(can(ROLES.USER, 'article:read')).toBe(true);
  });

  it('should check canEditArticle correctly', () => {
    const creatorUser = { id: 'user-1', role: ROLES.CREATOR };
    const otherCreator = { id: 'user-2', role: ROLES.CREATOR };
    const superadmin = { id: 'admin-1', role: ROLES.SUPERADMIN };
    const article = { authorId: 'user-1' };

    expect(canEditArticle(creatorUser, article)).toBe(true);
    expect(canEditArticle(otherCreator, article)).toBe(false);
    expect(canEditArticle(superadmin, article)).toBe(true);
    expect(canEditArticle(null, article)).toBe(false);
  });

  it('should check canManageTenant correctly', () => {
    const owner = { id: 'user-1', role: ROLES.CREATOR };
    const otherUser = { id: 'user-2', role: ROLES.USER };
    const superadmin = { id: 'admin-1', role: ROLES.SUPERADMIN };
    const tenant = { ownerId: 'user-1' };

    expect(canManageTenant(owner, tenant)).toBe(true);
    expect(canManageTenant(otherUser, tenant)).toBe(false);
    expect(canManageTenant(superadmin, tenant)).toBe(true);
  });

  it('should throw PermissionError when require fails', () => {
    expect(() => require(ROLES.USER, 'admin:config:edit')).toThrow(PermissionError);
    expect(() => require(ROLES.SUPERADMIN, 'admin:config:edit')).not.toThrow();
  });
});
