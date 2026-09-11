// =====================================================================
// 🛡️ SSRF Shield — Protection anti-Server-Side Request Forgery
// =====================================================================
// Valide et assainit rigoureusement les URLs externes (ex. import de flux RSS,
// webhooks, images distantes) avant tout fetch côté serveur.
// Bloque :
//   - Les schémas non-HTTP/HTTPS (file://, gopher://, data://, etc.)
//   - Les ports non standards (seuls 80 et 443 autorisés)
//   - Les adresses loopback (127.0.0.0/8, ::1, localhost)
//   - Les plages privées RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
//   - Les adresses link-local / cloud metadata (169.254.0.0/16, fe80::/10, metadata.google.internal)
//   - Les adresses Carrier-Grade NAT (100.64.0.0/10)
//   - Les adresses IPv4-mapped IPv6 (::ffff:127.0.0.1)
//   - Les tentatives de DNS Rebinding via résolution DNS synchrone à la validation
// =====================================================================

export interface SSRFValidationResult {
  valid: boolean;
  error?: string;
  url?: URL;
}

/**
 * Vérifie si une adresse IPv4 est dans une plage privée, loopback ou réservée.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformé -> considéré comme dangereux
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Réseau actuel)
  if (a === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (RFC 1918 Privé)
  if (a === 10) return true;

  // 172.16.0.0/12 (RFC 1918 Privé)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (RFC 1918 Privé)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-Local / Cloud Metadata AWS, GCP, Azure, DO, etc.)
  if (a === 169 && b === 254) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 192.0.2.0/24 (TEST-NET-1), 198.51.100.0/24 (TEST-NET-2), 203.0.113.0/24 (TEST-NET-3)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Réservé) & 255.255.255.255 (Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Vérifie si une adresse IPv6 est loopback, link-local, unique local ou IPv4-mapped privé.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Loopback ::1
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // Unspecified ::
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // Link-local fe80::/10
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  // Unique local fc00::/7 (fc00:: et fd00::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 ou ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.replace('::ffff:', '');
    if (v4Part.includes('.')) {
      return isPrivateOrReservedIPv4(v4Part);
    }
  }

  return false;
}

const FORBIDDEN_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

/**
 * Valide qu'une URL externe est strictement publique et inoffensive.
 */
export async function validateSafeExternalUrl(rawUrl: string): Promise<SSRFValidationResult> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL invalide ou vide' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'Syntaxe d’URL invalide' };
  }

  // 1. Schéma strict
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: `Protocole non autorisé : ${parsed.protocol}. Seuls http: et https: sont acceptés.`,
    };
  }

  // 2. Ports stricts (standard web uniquement)
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    const isStandardHttp = parsed.protocol === 'http:' && portNum === 80;
    const isStandardHttps = parsed.protocol === 'https:' && portNum === 443;
    if (!isStandardHttp && !isStandardHttps) {
      return {
        valid: false,
        error: `Port non autorisé : ${parsed.port}. Seuls les ports 80 et 443 sont permis.`,
      };
    }
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // 3. Noms d'hôtes interdits
  if (
    FORBIDDEN_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return {
      valid: false,
      error: `Nom d’hôte réservé ou local interdit : ${hostname}`,
    };
  }

  // 4. Détection directe d'adresses IP
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(hostname)) {
    if (isPrivateOrReservedIPv4(hostname)) {
      return {
        valid: false,
        error: `Adresse IP privée ou réservée interdite : ${hostname}`,
      };
    }
  } else if (hostname.includes(':')) {
    if (isPrivateOrReservedIPv6(hostname)) {
      return {
        valid: false,
        error: `Adresse IPv6 privée ou réservée interdite : ${hostname}`,
      };
    }
  }

  // 5. Résolution DNS préventive contre le DNS Rebinding
  try {
    const dns = await import('node:dns');
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { valid: false, error: `Impossible de résoudre le nom d'hôte : ${hostname}` };
    }

    for (const record of addresses) {
      if (record.family === 4) {
        if (isPrivateOrReservedIPv4(record.address)) {
          return {
            valid: false,
            error: `Le domaine ${hostname} résout vers une IP privée interdite (${record.address})`,
          };
        }
      } else if (record.family === 6) {
        if (isPrivateOrReservedIPv6(record.address)) {
          return {
            valid: false,
            error: `Le domaine ${hostname} résout vers une IP IPv6 privée interdite (${record.address})`,
          };
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Échec de résolution DNS';
    return { valid: false, error: `Échec de résolution DNS pour ${hostname} : ${message}` };
  }

  return { valid: true, url: parsed };
}
