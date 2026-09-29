// =====================================================================
// 🧾 Export Markdown des notes de livres — logique pure (testée en node)
// =====================================================================
// Regroupées par livre puis par chapitre (c'est l'ordre de lecture, pas
// l'ordre de saisie). Sortie prête pour Notion/Obsidian : une note sans
// commentaire reste un passage cité, une note sans passage reste un mot —
// aucune ligne inventée pour « remplir ».
// =====================================================================

export interface ExportableNote {
  id: string;
  ebookId: string;
  ebookTitle: string;
  ebookAuthor: string;
  chapterIndex: number;
  chapterTitle: string;
  excerpt: string;
  note: string;
  createdAt: string;
}

export function formatExportDate(date: Date = new Date()): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function notesToMarkdown(notes: ExportableNote[], date: Date = new Date()): string {
  if (!notes.length) return '';

  // Regroupement livre → chapitre, chaque niveau trié (ordre de lecture,
  // puis ordre d'écriture à l'intérieur d'un chapitre).
  const byBook = new Map<string, ExportableNote[]>();
  for (const note of notes) {
    const list = byBook.get(note.ebookId) ?? [];
    list.push(note);
    byBook.set(note.ebookId, list);
  }

  const books = Array.from(byBook.entries()).sort((a, b) =>
    (a[1][0]?.ebookTitle ?? '').localeCompare(b[1][0]?.ebookTitle ?? '', 'fr')
  );

  const count = notes.length;
  let md = `# 📚 Mes notes de lecture — Qoefi\n\n`;
  md += `*Export du ${formatExportDate(date)} — ${count} note${count > 1 ? 's' : ''}, ${books.length} livre${books.length > 1 ? 's' : ''}*\n\n---\n\n`;

  for (const [, bookNotes] of books) {
    const first = bookNotes[0];
    md += `## 📖 ${first.ebookTitle}\n`;
    if (first.ebookAuthor) md += `*${first.ebookAuthor}*\n`;
    md += `\n`;

    const byChapter = new Map<number, ExportableNote[]>();
    for (const note of bookNotes) {
      const list = byChapter.get(note.chapterIndex) ?? [];
      list.push(note);
      byChapter.set(note.chapterIndex, list);
    }

    for (const [chapterIndex, chapterNotes] of Array.from(byChapter.entries()).sort(
      (a, b) => a[0] - b[0]
    )) {
      const chapterLabel = chapterNotes[0].chapterTitle || `Chapitre ${chapterIndex + 1}`;
      md += `### ${chapterLabel}\n\n`;
      for (const note of chapterNotes.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (note.excerpt) md += `> « ${note.excerpt} »\n\n`;
        if (note.note) md += `**Note :** ${note.note}\n\n`;
      }
    }
    md += `---\n\n`;
  }

  return md;
}
