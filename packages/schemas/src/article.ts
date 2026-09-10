// =====================================================================
// 📰 article.ts — Schémas d'articles et de métadonnées éditoriales
// =====================================================================

import { z } from 'zod';

/**
 * 📰 Titre d'article (3-200 caractères).
 */
export const articleTitleSchema = z
  .string()
  .min(3, 'Le titre doit comporter au moins 3 caractères')
  .max(200, 'Le titre ne peut pas dépasser 200 caractères');
