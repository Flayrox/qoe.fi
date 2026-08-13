/**
 * Get the cookie domain dynamically based on the current hostname.
 * Allows cookie sharing across subdomains (e.g., .localhost in dev, .qoe.fi in prod).
 * Returns undefined for bare 'localhost' to prevent browser rejection.
 */
export function getCookieDomain(hostname?: string) {
  let activeHost = hostname;
  if (!activeHost) {
    const glob = globalThis as { window?: { location: { hostname: string } } };
    if (typeof glob.window !== 'undefined') {
      activeHost = glob.window.location.hostname;
    } else {
      // Server-side fallback if hostname is not passed
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl) {
        try {
          activeHost = new URL(appUrl).hostname;
        } catch {
          return undefined;
        }
      } else {
        return undefined;
      }
    }
  }

  if (!activeHost) {
    return undefined;
  }

  // Split port if present
  activeHost = activeHost.split(':')[0];

  // In development, return '.qoe.test' for any subdomain or root domain of qoe.test
  if (activeHost.endsWith('qoe.test')) {
    return '.qoe.test';
  }

  // In development, return '.lvh.me' for any subdomain or root domain of lvh.me,
  // as well as bare 'localhost' or '127.0.0.1' so cookies are shared across all app ports.
  if (
    activeHost === 'localhost' ||
    activeHost === '127.0.0.1' ||
    activeHost.endsWith('.localhost') ||
    activeHost.endsWith('lvh.me')
  ) {
    return '.lvh.me';
  }

  // For production domains
  if (activeHost.endsWith('qoe.fi')) {
    return '.qoe.fi';
  }

  return `.${activeHost}`;
}
