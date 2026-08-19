// =====================================================================
// 🔗 Referrers — catégorisation des sources de trafic
// =====================================================================
// Fonction pure (testable) utilisée par le studio pour afficher les
// sources de trafic : accès direct, moteurs de recherche, réseaux
// sociaux, newsletters…
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

export function getReferrerLabel(rawReferrer: string): ReferrerLabel {
  if (!rawReferrer || rawReferrer === '' || rawReferrer === 'direct' || rawReferrer === '(none)') {
    return { name: 'Accès direct / Marque-page', category: 'Direct' };
  }
  const lower = rawReferrer.toLowerCase();

  for (const [pattern, name] of SEARCH_ENGINES) {
    if (pattern.test(lower)) return { name, category: 'Recherche' };
  }
  for (const [pattern, name] of SOCIAL_NETWORKS) {
    if (pattern.test(lower)) return { name, category: 'Réseaux Sociaux' };
  }
  for (const [pattern, name] of NEWSLETTERS) {
    if (pattern.test(lower)) return { name, category: 'Newsletter' };
  }

  return {
    name: rawReferrer.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    category: 'Web Referrer',
  };
}
