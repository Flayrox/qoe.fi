// =====================================================================
// 🔗 Referrers — catégorisation des sources de trafic
// =====================================================================
// Fonction pure (testable) utilisée par le studio pour afficher les
// sources de trafic : accès direct, moteurs de recherche, réseaux
// sociaux, newsletters…
// ⚠️ Le classement se fait sur l'HÔTE du referrer, jamais sur l'URL entière :
// `https://example.com/t.co/article` n'est pas X/Twitter et
// `https://myblog.com/google-analytics-guide` n'est pas Google.
// =====================================================================

export interface ReferrerLabel {
  name: string;
  category: 'Direct' | 'Recherche' | 'Réseaux Sociaux' | 'Newsletter' | 'Web Referrer';
}

const SEARCH_ENGINES: Array<[RegExp, string]> = [
  [/google/, 'Google Search'],
  [/bing/, 'Bing'],
  [/duckduckgo/, 'DuckDuckGo'],
  [/yahoo/, 'Yahoo'],
  [/qwant/, 'Qwant'],
  [/ecosia/, 'Ecosia'],
  [/brave/, 'Brave Search'],
];

const SOCIAL_NETWORKS: Array<[RegExp, string]> = [
  [/twitter|t\.co|x\.com/, 'X / Twitter'],
  [/linkedin/, 'LinkedIn'],
  [/facebook|fb\./, 'Facebook'],
  [/instagram/, 'Instagram'],
  [/threads/, 'Threads'],
  [/youtube/, 'YouTube'],
  [/tiktok/, 'TikTok'],
  [/reddit/, 'Reddit'],
  [/discord/, 'Discord'],
  [/mastodon/, 'Mastodon'],
];

const NEWSLETTERS: Array<[RegExp, string]> = [
  [/substack/, 'Substack Network'],
  [/beehiiv/, 'beehiiv'],
  [/buttondown/, 'Buttondown'],
  [/mailchimp/, 'Mailchimp'],
  [/ghost/, 'Ghost Newsletter'],
  [/brevo|sendinblue/, 'Brevo'],
];

/** Hôte d'un referrer brut (URL complète ou domaine nu), ou `null`. */
function referrerHostname(rawReferrer: string): string | null {
  const value = rawReferrer.trim();
  if (!value) {
    return null;
  }
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getReferrerLabel(rawReferrer: string): ReferrerLabel {
  if (!rawReferrer || rawReferrer === '' || rawReferrer === 'direct' || rawReferrer === '(none)') {
    return { name: 'Accès direct / Marque-page', category: 'Direct' };
  }

  const hostname = referrerHostname(rawReferrer) ?? rawReferrer.toLowerCase();

  for (const [pattern, name] of SEARCH_ENGINES) {
    if (pattern.test(hostname)) return { name, category: 'Recherche' };
  }
  for (const [pattern, name] of SOCIAL_NETWORKS) {
    if (pattern.test(hostname)) return { name, category: 'Réseaux Sociaux' };
  }
  for (const [pattern, name] of NEWSLETTERS) {
    if (pattern.test(hostname)) return { name, category: 'Newsletter' };
  }

  return {
    name: rawReferrer.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    category: 'Web Referrer',
  };
}
