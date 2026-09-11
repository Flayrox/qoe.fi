import { describe, expect, it } from 'vitest';
import { isPrivateOrReservedIPv4, isPrivateOrReservedIPv6, validateSafeExternalUrl } from '../ssrf';

describe('🛡️ SSRF Shield — isPrivateOrReservedIPv4', () => {
  it('identifie correctement les IPs loopback et réseau actuel', () => {
    expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('127.1.2.3')).toBe(true);
    expect(isPrivateOrReservedIPv4('0.0.0.0')).toBe(true);
  });

  it('identifie les plages privées RFC 1918', () => {
    expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('10.255.255.254')).toBe(true);
    expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('192.168.0.254')).toBe(true);
  });

  it('identifie les métadonnées cloud (AWS, GCP, Azure 169.254.169.254)', () => {
    expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIPv4('169.254.1.1')).toBe(true);
  });

  it('identifie le Carrier-Grade NAT (100.64.0.0/10)', () => {
    expect(isPrivateOrReservedIPv4('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('100.127.255.255')).toBe(true);
    expect(isPrivateOrReservedIPv4('100.128.0.1')).toBe(false);
  });

  it('autorise les IPs publiques légitimes', () => {
    expect(isPrivateOrReservedIPv4('1.1.1.1')).toBe(false);
    expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIPv4('140.82.121.3')).toBe(false);
  });
});

describe('🛡️ SSRF Shield — isPrivateOrReservedIPv6', () => {
  it('identifie le loopback et unspecified', () => {
    expect(isPrivateOrReservedIPv6('::1')).toBe(true);
    expect(isPrivateOrReservedIPv6('::')).toBe(true);
  });

  it('identifie le link-local fe80::', () => {
    expect(isPrivateOrReservedIPv6('fe80::1')).toBe(true);
  });

  it('identifie les uniques locales fc00:: / fd00::', () => {
    expect(isPrivateOrReservedIPv6('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIPv6('fd12:3456:789a::1')).toBe(true);
  });

  it('identifie les IPv4-mapped IPv6', () => {
    expect(isPrivateOrReservedIPv6('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv6('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIPv6('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('🛡️ SSRF Shield — validateSafeExternalUrl', () => {
  it('rejette les schémas non-HTTP/HTTPS', async () => {
    const resFile = await validateSafeExternalUrl('file:///etc/passwd');
    expect(resFile.valid).toBe(false);
    expect(resFile.error).toContain('Protocole non autorisé');

    const resGopher = await validateSafeExternalUrl('gopher://127.0.0.1:6379');
    expect(resGopher.valid).toBe(false);

    const resData = await validateSafeExternalUrl('data:text/html,<script>alert(1)</script>');
    expect(resData.valid).toBe(false);
  });

  it('rejette les ports non standards (anti-port-scan)', async () => {
    const resSSH = await validateSafeExternalUrl('http://example.com:22/feed.xml');
    expect(resSSH.valid).toBe(false);
    expect(resSSH.error).toContain('Port non autorisé');

    const resApi = await validateSafeExternalUrl('http://example.com:15407/v1/admin');
    expect(resApi.valid).toBe(false);
    expect(resApi.error).toContain('Port non autorisé');
  });

  it('rejette les noms d’hôtes locaux et metadata', async () => {
    const resLocalhost = await validateSafeExternalUrl('http://localhost/rss.xml');
    expect(resLocalhost.valid).toBe(false);

    const resMetadata = await validateSafeExternalUrl(
      'http://metadata.google.internal/computeMetadata/v1/'
    );
    expect(resMetadata.valid).toBe(false);
  });

  it('rejette les IPs directes privées ou loopback', async () => {
    const res127 = await validateSafeExternalUrl('http://127.0.0.1/rss');
    expect(res127.valid).toBe(false);

    const res169 = await validateSafeExternalUrl('http://169.254.169.254/latest/meta-data');
    expect(res169.valid).toBe(false);
  });

  it('accepte les URLs publiques légitimes', async () => {
    const resGitHub = await validateSafeExternalUrl('https://github.com/blog.atom');
    expect(resGitHub.valid).toBe(true);
    expect(resGitHub.url?.hostname).toBe('github.com');
  });
});
