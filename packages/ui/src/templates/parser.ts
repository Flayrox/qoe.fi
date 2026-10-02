// =====================================================================
// ⚙️ parser.ts — Parser Auto-guérisseur & Sérialiseur (Licorne 2026)
// =====================================================================
// Assure la conversion bidirectionnelle et sans friction entre :
// - La colonne PostgreSQL `Publication.layoutStyle` (TEXT)
// - L'AST typé `LayoutConfig` manipulable par React et le Studio.
//
// Résilience quantique :
// 1. Rétrocompatibilité totale avec les mots-clés historiques ('minimal', 'magazine'...)
// 2. Auto-réparation en cas de JSON partiel, tronqué ou corrompu
// 3. Déduplication des identifiants de blocs
// 4. Fusion transparente des surcharges de tokens (police, couleur d'accent)
// =====================================================================

import type {
  LayoutConfig,
  TemplateBlock,
  BlockType,
  CardCornerShape,
  DensityMode,
  SurfaceStyle,
  TemplateArchetypeId,
} from './schema';
import {
  ARCHETYPES_REGISTRY,
  BROADSHEET_MODERN_CONFIG,
  MINIMAL_PORTFOLIO_CONFIG,
} from './defaults';

/** Types de blocs autorisés pour le filtrage strict */
const VALID_BLOCK_TYPES: Set<BlockType> = new Set([
  'navbar',
  'hero',
  'lead-story',
  'bento-grid',
  'article-stream',
  'newsletter-wall',
  'footer',
]);

const VALID_CARD_SHAPES: Set<CardCornerShape> = new Set([
  'rounded-none',
  'rounded-lg',
  'rounded-xl',
  'rounded-2xl',
  'rounded-3xl',
  'rounded-full',
]);

const VALID_DENSITIES: Set<DensityMode> = new Set(['compact', 'standard', 'spacious']);

const VALID_SURFACES: Set<SurfaceStyle> = new Set(['flat', 'bordered', 'glassmorphic', 'elevated']);

/** Clone profond sans dépendance externe */
function deepClone<T>(obj: T): T {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj)) as T;
  }
}

/** Génère un identifiant unique robuste pour un bloc */
function generateBlockId(type: string, index: number): string {
  const salt = Math.random().toString(36).substring(2, 7);
  return `block_${type}_${index}_${salt}`;
}

/**
 * 🔍 Parse et hydrate une configuration de mise en page depuis une chaîne brute.
 * Tolère absolument toutes les entrées sans jamais lever d'exception.
 *
 * @param raw Valeur stockée en base (JSON stringifié ou nom d'archétype)
 * @param tokenOverrides Valeurs optionnelles issues de la publication (accentColor, fontFamily)
 */
export function parseLayoutConfig(
  raw: string | null | undefined,
  tokenOverrides?: { accentColor?: string | null; fontFamily?: string | null }
): LayoutConfig {
  let resolvedConfig: LayoutConfig;

  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    resolvedConfig = deepClone(MINIMAL_PORTFOLIO_CONFIG);
  } else {
    const trimmed = raw.trim();

    // 1. Détection des identifiants d'archétypes simples ('magazine', 'broadsheet', etc.)
    if (ARCHETYPES_REGISTRY[trimmed]) {
      resolvedConfig = deepClone(ARCHETYPES_REGISTRY[trimmed]);
    } else if (trimmed === 'brutalist') {
      // Rétrocompatibilité spécifique : l'ancien 'brutalist' correspond au Broadsheet contemporain
      resolvedConfig = deepClone(BROADSHEET_MODERN_CONFIG);
    } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      // 2. Détection de JSON structuré
      try {
        const parsed = JSON.parse(trimmed) as Partial<LayoutConfig>;
        resolvedConfig = sanitizeLayoutConfig(parsed);
      } catch {
        // En cas de corruption JSON, repli élégant sur le preset minimal
        resolvedConfig = deepClone(MINIMAL_PORTFOLIO_CONFIG);
      }
    } else {
      // Valeur textuelle non reconnue -> repli par défaut
      resolvedConfig = deepClone(MINIMAL_PORTFOLIO_CONFIG);
    }
  }

  // 3. Application des surcharges transmises au niveau de la publication
  if (tokenOverrides?.accentColor && tokenOverrides.accentColor.trim()) {
    resolvedConfig.tokens.accentColor = tokenOverrides.accentColor.trim();
  }
  if (tokenOverrides?.fontFamily && tokenOverrides.fontFamily.trim()) {
    resolvedConfig.tokens.fontFamily = tokenOverrides.fontFamily.trim();
  }

  return resolvedConfig;
}

/**
 * 🛡️ Assainit et valide un objet LayoutConfig pour garantir l'intégrité de l'AST
 */
function sanitizeLayoutConfig(input: Partial<LayoutConfig>): LayoutConfig {
  const archetypeId: TemplateArchetypeId =
    input.archetype && ARCHETYPES_REGISTRY[input.archetype] ? input.archetype : 'custom';

  const baseConfig = ARCHETYPES_REGISTRY[archetypeId] || MINIMAL_PORTFOLIO_CONFIG;

  const cardShape =
    input.tokens?.cardShape && VALID_CARD_SHAPES.has(input.tokens.cardShape)
      ? input.tokens.cardShape
      : baseConfig.tokens.cardShape;

  const density =
    input.tokens?.density && VALID_DENSITIES.has(input.tokens.density)
      ? input.tokens.density
      : baseConfig.tokens.density;

  const surface =
    input.tokens?.surface && VALID_SURFACES.has(input.tokens.surface)
      ? input.tokens.surface
      : baseConfig.tokens.surface;

  const fontFamily = input.tokens?.fontFamily || baseConfig.tokens.fontFamily;
  const accentColor = input.tokens?.accentColor || baseConfig.tokens.accentColor;

  const seenIds = new Set<string>();
  const sanitizedBlocks: TemplateBlock[] = [];

  if (Array.isArray(input.blocks) && input.blocks.length > 0) {
    input.blocks.forEach((block, index) => {
      if (!block || typeof block !== 'object') return;

      const rawType = (block as { type?: unknown }).type;
      const type: BlockType =
        typeof rawType === 'string' && VALID_BLOCK_TYPES.has(rawType as BlockType)
          ? (rawType as BlockType)
          : 'article-stream';

      let id = typeof block.id === 'string' && block.id.trim() ? block.id.trim() : '';
      if (!id || seenIds.has(id)) {
        id = generateBlockId(type, index);
      }
      seenIds.add(id);

      const label =
        typeof block.label === 'string' && block.label.trim()
          ? block.label.trim()
          : `Section ${type}`;

      const visible = typeof block.visible === 'boolean' ? block.visible : true;
      const locked = typeof block.locked === 'boolean' ? block.locked : false;
      const props = block.props && typeof block.props === 'object' ? { ...block.props } : {};

      sanitizedBlocks.push({
        id,
        type,
        label,
        visible,
        locked,
        props,
      });
    });
  }

  // Si aucun bloc valide n'a pu être extrait, copier les blocs par défaut de l'archétype
  const finalBlocks = sanitizedBlocks.length > 0 ? sanitizedBlocks : deepClone(baseConfig.blocks);

  return {
    version: 1,
    archetype: archetypeId,
    tokens: {
      cardShape,
      density,
      surface,
      fontFamily,
      accentColor,
    },
    blocks: finalBlocks,
  };
}

/**
 * 💾 Sérialise un LayoutConfig pour persistance propre dans PostgreSQL.
 * Nettoie les champs éphémères et compacte le JSON.
 */
export function serializeLayoutConfig(config: LayoutConfig): string {
  const cleanConfig: LayoutConfig = {
    version: config.version || 1,
    archetype: config.archetype || 'custom',
    tokens: {
      cardShape: config.tokens.cardShape,
      density: config.tokens.density,
      surface: config.tokens.surface,
      fontFamily: config.tokens.fontFamily,
      accentColor: config.tokens.accentColor,
    },
    blocks: config.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      label: block.label,
      visible: block.visible,
      locked: block.locked || false,
      props: block.props || {},
    })),
  };

  return JSON.stringify(cleanConfig);
}
