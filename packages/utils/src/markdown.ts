// =====================================================================
// 📝 markdown — Rendu markdown minimal, sans dépendance, sûr par défaut
// =====================================================================
// Pourquoi maison plutôt qu'une lib ? Le contenu juridique est le seul
// endroit où l'on rend du markdown, dans deux apps (admin + tenants), et
// on ne veut ni nouvelle dépendance ni surface XSS. Le parti pris :
//   - tout le texte est échappé AVANT le rendu → aucun HTML brut accepté ;
//   - les liens sont filtrés (http(s), mailto, tel, relatifs, ancres) ;
//   - le balisage supporté couvre ce qu'utilisent les textes légaux :
//     titres (ancrés), listes, tableaux, citations, code, gras/italique.
// Rien de plus : pas de HTML inline, pas d'extensions exotiques.
// =====================================================================

import { slugify } from './slugify';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 🔒 Échappe les caractères HTML sensibles. */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] as string);
}

/** 🔗 Autorise uniquement les schémas et cibles sûrs (anti-`javascript:`). */
function safeUrl(raw: string): string {
  const url = raw.trim();
  if (url === '') return '';
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^[/#]/.test(url)) return url;
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(url)) return `mailto:${url}`;
  return '';
}

/** ✨ Formate le texte inline (code, liens, images, gras, italique, barré). */
function inline(text: string): string {
  const codeSpans: string[] = [];
  // Le code inline est mis de côté pour ne pas être reformaté ensuite.
  let out = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  // Les URLs acceptent un niveau de parenthèses équilibrées, sinon
  // `[x](https://fr.wikipedia.org/wiki/A_(b))` serait tronqué à `A_`.
  const URL_PART = String.raw`((?:[^()\s]|\([^()\s]*\))+)`;

  out = out.replace(
    new RegExp(String.raw`!\[([^\]]*)\]\(` + URL_PART + String.raw`(?:\s+"([^"]*)")?\)`, 'g'),
    (_match, alt: string, url: string, title?: string) => {
      const src = safeUrl(url);
      if (!src) return alt;
      return `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy" />`;
    }
  );

  out = out.replace(
    new RegExp(String.raw`\[([^\]]+)\]\(` + URL_PART + String.raw`(?:\s+"([^"]*)")?\)`, 'g'),
    (_match, label: string, url: string, title?: string) => {
      const href = safeUrl(url);
      if (!href) return label;
      const external = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${href}"${title ? ` title="${title}"` : ''}${external}>${label}</a>`;
    }
  );

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');

  return out.replace(/\u0000(\d+)\u0000/g, (_match, idx: string) => codeSpans[Number(idx)] ?? '');
}

function isBlockStart(line: string): boolean {
  return (
    /^\s*```/.test(line) ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line)
  );
}

function renderTable(rows: string[]): string {
  const cells = (row: string) =>
    row
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => inline(escapeHtml(c.trim())));

  const header = cells(rows[0] ?? '');
  const body = rows.slice(1).map(cells);
  const thead = `<thead><tr>${header.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`;
  const tbody = body.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table>${thead}<tbody>${tbody}</tbody></table>`;
}

function renderList(items: string[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul';
  const body = items.map((item) => `<li>${inline(escapeHtml(item.trim()))}</li>`).join('');
  return `<${tag}>${body}</${tag}>`;
}

/**
 * 📝 Rend un markdown en HTML sûr (tout HTML source est échappé).
 *
 * @example
 *   markdownToHtml('# Titre\n\nTexte **gras** et `code`.')
 */
export function markdownToHtml(markdown: string): string {
  const src = (markdown ?? '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Bloc de code clôturé par ```
    const fence = /^\s*```\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const buffer: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? '')) {
        buffer.push(lines[i] ?? '');
        i++;
      }
      i++; // consomme la clôture
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(buffer.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push('<hr />');
      i++;
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const rawTitle = heading[2] ?? '';
      const title = inline(escapeHtml(rawTitle));
      const id = slugify(rawTitle);
      html.push(`<h${level}${id ? ` id="${id}"` : ''}>${title}</h${level}>`);
      i++;
      continue;
    }

    // Citation : lignes « > » consécutives, rendues récursivement.
    if (/^\s{0,3}>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i] ?? '')) {
        quote.push((lines[i] ?? '').replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${markdownToHtml(quote.join('\n'))}</blockquote>`);
      continue;
    }

    // Tableau : lignes « | … | » suivies d'une ligne de séparation.
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')) {
      const rows: string[] = [];
      i++; // saute l'en-tête
      i++; // saute la séparation
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i] ?? '')) {
        rows.push(lines[i] ?? '');
        i++;
      }
      html.push(renderTable([line, ...rows]));
      continue;
    }

    // Listes à puces / numérotées.
    const listMatch = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1] ?? '');
      const items: string[] = [];
      while (i < lines.length) {
        const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i] ?? '');
        if (item) {
          items.push(item[2] ?? '');
          i++;
          continue;
        }
        // Ligne de continuation d'un item (indentée, non vide).
        if (/^\s{2,}\S/.test(lines[i] ?? '') && items.length > 0) {
          items[items.length - 1] = `${items[items.length - 1]} ${(lines[i] ?? '').trim()}`;
          i++;
          continue;
        }
        break;
      }
      html.push(renderList(items, ordered));
      continue;
    }

    // Paragraphe : accumule jusqu'à une ligne vide ou un début de bloc.
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i] ?? '') &&
      !(paragraph.length > 0 && isBlockStart(lines[i] ?? ''))
    ) {
      paragraph.push(lines[i] ?? '');
      i++;
    }
    html.push(`<p>${inline(escapeHtml(paragraph.join('\n'))).replace(/\n/g, '<br />')}</p>`);
  }

  return html.join('\n');
}

/**
 * 📑 Extrait les titres d'un markdown pour construire une table des matières.
 */
export function markdownHeadings(markdown: string): { id: string; text: string; level: number }[] {
  const out: { id: string; text: string; level: number }[] = [];
  let inFence = false;
  for (const line of (markdown ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const rawTitle = match[2] ?? '';
    out.push({ id: slugify(rawTitle), text: rawTitle, level: match[1]?.length ?? 1 });
  }
  return out;
}
