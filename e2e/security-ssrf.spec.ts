// =====================================================================
// 🛡️ E2E — Sécurité SSRF (Server-Side Request Forgery) Shield
// =====================================================================
// Valide le blocage étanche de toute tentative d'exfiltration ou d'accès
// aux ressources internes (cloud metadata, loopback, réseaux privés RFC 1918,
// protocoles non-HTTP, ports interdits).
// =====================================================================

import { test, expect } from '@playwright/test';
import { validateSafeExternalUrl } from '../packages/utils/src/ssrf';

test.describe('SSRF Protection Shield', () => {
  const privateAndDangerousTargets = [
    { target: 'http://127.0.0.1:8080/secret', name: 'IPv4 Loopback (127.0.0.1)' },
    { target: 'http://localhost:3000/internal', name: 'Localhost domain' },
    {
      target: 'http://169.254.169.254/latest/meta-data/',
      name: 'AWS/GCP Cloud Metadata (169.254.169.254)',
    },
    { target: 'http://10.0.0.1/admin', name: 'Private Subnet Class A (10.0.0.0/8)' },
    { target: 'http://172.16.0.1/internal', name: 'Private Subnet Class B (172.16.0.0/12)' },
    { target: 'http://192.168.1.1/router-config', name: 'Private Subnet Class C (192.168.0.0/16)' },
    { target: 'http://[::1]/secret', name: 'IPv6 Loopback (::1)' },
    { target: 'http://[fe80::1]/link-local', name: 'IPv6 Link-Local (fe80::)' },
    { target: 'http://[fc00::1]/unique-local', name: 'IPv6 Unique Local (fc00::)' },
    { target: 'file:///etc/passwd', name: 'Local file protocol (file://)' },
    { target: 'gopher://127.0.0.1:70/', name: 'Gopher protocol (gopher://)' },
    { target: 'ftp://ftp.example.com/data', name: 'FTP protocol (ftp://)' },
    { target: 'http://example.com:22/ssh', name: 'Non-standard port (SSH 22)' },
    { target: 'http://example.com:3306/db', name: 'Internal database port (MySQL 3306)' },
    {
      target: 'http://example.com:5432/postgres',
      name: 'Internal database port (PostgreSQL 5432)',
    },
    { target: 'javascript:alert(1)', name: 'Javascript pseudo-protocol' },
  ];

  for (const { target, name } of privateAndDangerousTargets) {
    test(`neutralise formellement l'attaque SSRF via ${name}`, async () => {
      const result = await validateSafeExternalUrl(target);
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  }

  test('autorise les URL HTTPS publiques légitimes', async () => {
    const publicUrl = 'https://news.ycombinator.com/rss';
    const result = await validateSafeExternalUrl(publicUrl);
    expect(result.valid).toBe(true);
    expect(result.url).toBeDefined();
    expect(result.url?.protocol).toBe('https:');
  });

  test('refuse les domaines non résolubles (NXDOMAIN) sans planter', async () => {
    const nonExistent = 'https://this-domain-definitely-does-not-exist-123456789.org/feed.xml';
    const result = await validateSafeExternalUrl(nonExistent);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('résolution');
  });
});
