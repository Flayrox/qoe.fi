// =====================================================================
// 📰 article.ts — Schémas d'articles et de métadonnées éditoriales
// =====================================================================

import { singleLineText } from './common';

/**
 * 📰 Titre d'article (3-200 caractères, mono-ligne, sans caractère de contrôle).
 */
export const articleTitleSchema = singleLineText('Le titre', 200, 3);
