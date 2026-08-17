import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// =====================================================================
// 📄 html-blocks.tsx — Rendu HTML léger pour la lecture d'article mobile
// =====================================================================
// L'API Go renvoie le contenu d'article en HTML (contentHtml). On n'ajoute
// PAS de dépendance (react-native-render-html…) : ce module parse le HTML
// avec un mini-parseur maison (Regex/stack) vers une liste de blocs
// typographiques (p, h1-h4, ul/ol/li, blockquote, img, hr, code, a…)
// rendus avec les composants Themed. Suffisant pour les articles qoe.fi.
// ⚠️ Sécurité : aucune exécution — on ne rend que des Text/Image React
//    Native, jamais de HTML brut (équivalent natif de sanitizeHtml).
// =====================================================================

type Block =
  | { type: 'p'; text: string }
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'img'; src: string; alt?: string }
  | { type: 'hr' }
  | { type: 'code'; text: string };

// Décode les entités HTML courantes.
function decodeEntities(input: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&apos;': "'",
    '&eacute;': 'é',
    '&egrave;': 'è',
    '&agrave;': 'à',
    '&ccedil;': 'ç',
    '&ucirc;': 'û',
    '&ocirc;': 'ô',
    '&ecirc;': 'ê',
    '&icirc;': 'î',
    '&acirc;': 'â',
    '&laquo;': '«',
    '&raquo;': '»',
    '&mdash;': '—',
    '&rsquo;': '’',
    '&lsquo;': '‘',
    '&ldquo;': '“',
    '&rdquo;': '”',
  };
  return input.replace(/&[a-zA-Z0-9#]+;/g, (m) => entities[m] ?? m);
}

// Retire les balises mais préserve le texte (et les sauts pour <br>).
function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Convertit un fragment HTML en blocs typographiques.
 * Approche pragmatique : on découpe par balises de bloc connues, puis on
 * traite les listes et le contenu restant ligne par ligne.
 */
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];

  // Extraction des <img> d'abord (avec leur alt).
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  const images: Array<{ src: string; alt?: string }> = [];
  while ((match = imgRegex.exec(html)) !== null) {
    const altMatch = /alt=["']([^"']*)["']/i.exec(match[0]);
    images.push({ src: match[1], alt: altMatch?.[1] });
  }

  // Découpe en segments de niveau bloc.
  const segments = html.split(/<(p|h[1-6]|ul|ol|blockquote|hr|pre|div)[^>]*>/i);

  for (const segment of segments) {
    const s = segment.trim();
    if (!s) continue;

    // Liste : chaque <li> devient un item.
    if (/^<li[\s>]/i.test(s)) {
      const items = Array.from(s.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) =>
        stripTags(m[1])
      );
      const ordered = /^<ol[\s>]/i.test(s);
      if (items.length) blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    // Séparateur horizontal.
    if (/^<hr[\s>]/i.test(s)) {
      blocks.push({ type: 'hr' });
      continue;
    }
    // Code préformaté.
    if (/^<pre[\s>]/i.test(s)) {
      blocks.push({ type: 'code', text: stripTags(s) });
      continue;
    }
    // Bloc de citation.
    if (/^<blockquote[\s>]/i.test(s)) {
      blocks.push({ type: 'blockquote', text: stripTags(s) });
      continue;
    }
    // Titres.
    const heading = /^<h([1-6])[\s>]/i.exec(s);
    if (heading) {
      const level = Math.min(4, Math.max(1, Number(heading[1]))) as 1 | 2 | 3 | 4;
      const blockType = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      blocks.push({ type: blockType, text: stripTags(s) });
      continue;
    }

    // Paragraphe / div : on découpe les lignes vides.
    const text = stripTags(s);
    if (!text) continue;
    for (const paragraph of text.split(/\n{2,}/)) {
      if (paragraph.trim()) blocks.push({ type: 'p', text: paragraph.trim() });
    }
  }

  // Fallback : si aucun bloc (HTML sans balises de bloc), on ajoute les images
  // extraites + le texte brut restant.
  if (blocks.length === 0) {
    for (const img of images) blocks.push({ type: 'img', ...img });
    const plain = stripTags(html);
    if (plain) blocks.push({ type: 'p', text: plain });
  }
  return blocks;
}

function BlockView({ block }: { block: Block }) {
  const theme = useTheme();

  switch (block.type) {
    case 'h1':
      return <ThemedText style={styles.h1}>{block.text}</ThemedText>;
    case 'h2':
      return <ThemedText style={styles.h2}>{block.text}</ThemedText>;
    case 'h3':
      return <ThemedText style={styles.h3}>{block.text}</ThemedText>;
    case 'h4':
      return <ThemedText style={styles.h4}>{block.text}</ThemedText>;
    case 'p':
      return <ThemedText style={styles.paragraph}>{block.text}</ThemedText>;
    case 'blockquote':
      return (
        <View style={[styles.quote, { borderLeftColor: theme.primary }]}>
          <ThemedText style={[styles.quoteText, { color: theme.textSecondary }]}>
            {block.text}
          </ThemedText>
        </View>
      );
    case 'ul':
    case 'ol':
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <View key={index} style={styles.listItem}>
              <ThemedText style={[styles.bullet, { color: theme.textSecondary }]}>
                {block.type === 'ol' ? `${index + 1}.` : '•'}
              </ThemedText>
              <ThemedText style={styles.paragraph}>{item}</ThemedText>
            </View>
          ))}
        </View>
      );
    case 'img':
      return (
        <Image
          source={{ uri: block.src }}
          style={[styles.image, { backgroundColor: theme.backgroundSelected }]}
          contentFit="cover"
          transition={200}
          accessibilityLabel={block.alt}
        />
      );
    case 'hr':
      return <View style={[styles.hr, { backgroundColor: theme.border }]} />;
    case 'code':
      return (
        <View style={[styles.codeBlock, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="code" style={styles.codeText}>
            {block.text}
          </ThemedText>
        </View>
      );
    default:
      return null;
  }
}

export function ArticleHtml({ html }: { html: string }) {
  const blocks = htmlToBlocks(html);
  return (
    <View style={styles.container}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
  },
  h1: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  h3: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  h4: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.one,
  },
  quoteText: {
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  list: {
    gap: Spacing.one,
  },
  listItem: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 24,
    width: 20,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.two,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.two,
  },
  codeBlock: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  codeText: {
    lineHeight: 18,
  },
});
