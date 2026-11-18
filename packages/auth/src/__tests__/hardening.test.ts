// =====================================================================
// 🧪 @qoe/auth — durcissement (L04)
// =====================================================================
// Défauts constatés : hiérarchie de rôles non appliquée (`can` exigeait une
// égalité stricte), override négatif ignoré, HTML d'e-mail non échappé,
// cible de retour acceptée depuis n'importe quel Referer, `QOE_API_URL` figée
// à l'import.
// =====================================================================

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';

import { ROLES } from '@qoe/config';
import { can } from '../permissions';
import { canMedia } from '../media';
import { escapeHtml, renderSecurityLoginAlert, safeHref } from '../mailer';
import { goApiUrl, isGoEnabled } from '../go-client';
import { isSafeRedirectTarget } from '../redirect';

describe('L04 — hiérarchie des rôles', () => {
  it('un creator hérite des actions autorisées au rôle user', () => {
    expect(can(ROLES.CREATOR, 'post:create')).toBe(true);
    expect(can(ROLES.CREATOR, 'post:read')).toBe(true);
    expect(can(ROLES.CREATOR, 'article:read')).toBe(true);
    expect(can(ROLES.CREATOR, 'billing:read:own')).toBe(true);
  });

  it('un user ne monte jamais vers les actions creator/admin', () => {
    expect(can(ROLES.USER, 'article:create')).toBe(false);
    expect(can(ROLES.USER, 'admin:users:view')).toBe(false);
  });

  it('un rôle inconnu ou absent ne passe aucune action', () => {
    expect(can(null, 'post:read')).toBe(false);
    expect(can('fantome' as unknown as Parameters<typeof can>[0], 'post:read')).toBe(false);
  });
});

describe('L04 — overrides média', () => {
  it('un refus explicite prime sur une autorisation explicite', () => {
    expect(
      canMedia(
        {
          role: 'owner',
          status: 'active',
          permissions: ['-media:view_analytics', 'media:view_analytics'],
        },
        'media:view_analytics'
      )
    ).toBe(false);
  });

  it('un rôle inconnu ne donne aucune permission de base', () => {
    expect(canMedia({ role: 'intrus', status: 'active' }, 'media:create_articles')).toBe(false);
  });
});

describe('L04 — e-mails de sécurité', () => {
  it('échappe les données client interpolées', () => {
    const html = renderSecurityLoginAlert({
      toEmail: 'reader@example.com',
      userName: '<img src=x onerror="alert(1)">',
      deviceInfo: '"><a href="https://evil.test">Cliquez</a>',
      ipAddress: '1.2.3.4<script>',
    });

    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="https://evil.test"');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('&quot;&gt;&lt;a href=&quot;https://evil.test&quot;');
  });

  it('n’accepte que des liens http(s) dans un bouton', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>')).toBeNull();
    expect(safeHref('https://qoe.fi/settings')).toBe('https://qoe.fi/settings');
  });

  it('échappe les guillemets et apostrophes', () => {
    expect(escapeHtml(`"'&<>`)).toBe('&quot;&#39;&amp;&lt;&gt;');
  });
});

describe('L04 — cible de retour et client Go', () => {
  it('refuse une origine différente', () => {
    expect(isSafeRedirectTarget('https://qoe.fi/home', 'https://qoe.fi')).toBe(true);
    expect(isSafeRedirectTarget('https://evil.test/home', 'https://qoe.fi')).toBe(false);
    expect(isSafeRedirectTarget('//evil.test/home', 'https://qoe.fi')).toBe(false);
    expect(isSafeRedirectTarget('pas une url', 'https://qoe.fi')).toBe(false);
  });

  describe('QOE_API_URL lue à l’appel', () => {
    const previous = process.env.QOE_API_URL;
    beforeEach(() => {
      delete process.env.QOE_API_URL;
    });
    afterEach(() => {
      if (previous === undefined) delete process.env.QOE_API_URL;
      else process.env.QOE_API_URL = previous;
    });

    it('reflète une variable posée après l’import', () => {
      expect(isGoEnabled()).toBe(false);
      expect(goApiUrl()).toBeNull();
      process.env.QOE_API_URL = 'https://api.qoe.test/';
      expect(isGoEnabled()).toBe(true);
      expect(goApiUrl()).toBe('https://api.qoe.test');
    });
  });
});
