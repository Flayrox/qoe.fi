const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Normalise une URL saisie par l'auteur et refuse les schémas dangereux.
 *
 * - `javascript:` / `data:` / `vbscript:` → `null` (jamais écrits dans le HTML)
 * - `example.com/article` → `https://example.com/article`
 * - `auteur@exemple.fr` → `mailto:auteur@exemple.fr`
 * - `/rubrique/article` et `#ancre` sont conservés tels quels (liens internes)
 */
export function normalizeLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Liens internes au site : chemin absolu ou ancre.
  if (value.startsWith('/') || value.startsWith('#')) return value;

  // URL déjà préfixée d'un schéma : on ne garde que les schémas autorisés.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      return ALLOWED_PROTOCOLS.has(url.protocol.toLowerCase()) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  // Adresse e-mail saisie sans protocole (`mailto:` est traité plus haut).
  if (/^[^@\s/:]+@[^@\s/]+\.[^@\s/]+$/.test(value)) {
    return `mailto:${value}`;
  }

  // Domaine sans schéma : on suppose HTTPS plutôt que d'écrire un lien mort.
  if (/^[\w-]+(\.[\w-]+)+/.test(value)) {
    try {
      return new URL(`https://${value}`).toString();
    } catch {
      return null;
    }
  }

  return null;
}
