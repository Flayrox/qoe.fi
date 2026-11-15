import { normalizeLinkUrl } from './link';

export interface SourceRow {
  label: string;
  url: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Construit la section « Sources » à insérer en fin d'article. Les URLs
 * passent par le même normaliseur que les liens de l'éditeur : les schémas
 * dangereux sont ignorés, jamais écrits dans le HTML.
 */
export function buildSourcesHtml(rows: SourceRow[]): string | null {
  const items: Array<{ label: string; url: string }> = [];
  for (const row of rows) {
    const label = row.label.trim();
    const raw = row.url.trim();
    if (!label && !raw) continue;
    const url = normalizeLinkUrl(raw);
    if (!url) continue;
    items.push({ label: label || raw, url });
  }
  if (items.length === 0) return null;

  return `<h2>Sources</h2><ul>${items
    .map(
      (item) =>
        `<li><a href="${escapeHtml(item.url)}" rel="noopener noreferrer">${escapeHtml(item.label)}</a></li>`
    )
    .join('')}</ul>`;
}
