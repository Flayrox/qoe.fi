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
 * Développe une adresse IPv6 en 8 groupes de 16 bits.
 *
 * Les comparaisons par `startsWith` sur la forme écrite sont un piège : la
 * MÊME adresse a plusieurs écritures légales (`::ffff:127.0.0.1`,
 * `::ffff:7f00:1`, `0:0:0:0:0:ffff:7f00:1`). Seule la forme canonique en
 * groupes permet de conclure. Retourne `null` si l'adresse est illisible.
 */
function expandIPv6(input: string): number[] | null {
  let value = input
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');

  // Zone d'interface (fe80::1%eth0) : elle ne change pas l'adresse.
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  if (!value.includes(':')) return null;

  // IPv4 embarquée en fin d'adresse (`::ffff:127.0.0.1`).
  let embeddedV4: number[] = [];
  const v4Match = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (v4Match) {
    const octets = v4Match[1]!.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    embeddedV4 = [(octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!];
    value = value.slice(0, v4Match.index).replace(/:+$/, '');
    if (value === '') value = '::';
  }

  const halves = value.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (chunk: string | undefined): number[] | null => {
    if (!chunk) return [];
    const groups: number[] = [];
    for (const group of chunk.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };

  const head = parseGroups(halves[0]);
  const tail = parseGroups(halves[1]);
  if (!head || !tail) return null;

  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length + embeddedV4.length);
    if (missing < 0) return null;
    return [...head, ...new Array<number>(missing).fill(0), ...tail, ...embeddedV4];
  }

  const groups = [...head, ...tail, ...embeddedV4];
  return groups.length === 8 ? groups : null;
}

/** Recompose l'IPv4 portée par deux groupes IPv6. */
function ipv4FromGroups(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * Vérifie si une adresse IPv6 est loopback, link-local, unique local,
 * multicast, ou porte une IPv4 privée (mapped, translated, NAT64, 6to4).
 *
 * Une adresse illisible est considérée comme dangereuse (fail closed).
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const groups = expandIPv6(ip);
  if (!groups) return true;

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  const firstSixZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;

  // Unspecified (::) et loopback (::1).
  if (firstSixZero && g6 === 0 && (g7 === 0 || g7 === 1)) return true;

  // IPv4-compatible / IPv4-mapped (::a.b.c.d et ::ffff:a.b.c.d).
  if (
    (firstSixZero || (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff)) &&
    (g6 !== 0 || g7 !== 0)
  ) {
    return isPrivateOrReservedIPv4(ipv4FromGroups(g6, g7));
  }

  // IPv4-translated (::ffff:0:a.b.c.d).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) {
    return isPrivateOrReservedIPv4(ipv4FromGroups(g6, g7));
  }

  // NAT64 well-known prefix (64:ff9b::/96).
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPrivateOrReservedIPv4(ipv4FromGroups(g6, g7));
  }

  // 6to4 (2002::/16) : l'IPv4 est portée par les groupes 1 et 2.
  if (g0 === 0x2002) {
    return isPrivateOrReservedIPv4(ipv4FromGroups(g1, g2));
  }

  // Link-local fe80::/10.
  if ((g0 & 0xffc0) === 0xfe80) return true;

  // Unique local fc00::/7.
  if ((g0 & 0xfe00) === 0xfc00) return true;

  // Multicast ff00::/8.
  if ((g0 & 0xff00) === 0xff00) return true;

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
 *
 * `options.lookup` remplace la résolution DNS réelle : les tests n'ont pas à
 * dépendre du réseau (un lookup de `github.com` peut dépasser le délai d'un
 * test sur un runner lent, ce qui faisait échouer la CI sans qu'aucune règle
 * de sécurité soit en cause). En production, le défaut est `node:dns`.
 */
export type DnsLookup = (
  hostname: string
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

export async function validateSafeExternalUrl(
  rawUrl: string,
  options: { lookup?: DnsLookup } = {}
): Promise<SSRFValidationResult> {
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

  // 5. Résolution DNS préventive contre le DNS Rebinding (Node.js runtime uniquement)
  if (typeof process === 'undefined' || process.env.NEXT_RUNTIME === 'edge') {
    return { valid: true, url: parsed };
  }

  try {
    let addresses: ReadonlyArray<{ address: string; family: number }>;
    if (options.lookup) {
      addresses = await options.lookup(hostname);
    } else {
      const mod = 'node:dns';
      const dns = await import(/* webpackIgnore: true */ `${mod}`);
      addresses = await dns.promises.lookup(hostname, { all: true });
    }
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
