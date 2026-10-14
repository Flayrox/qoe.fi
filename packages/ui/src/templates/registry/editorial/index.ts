import { StandardShell } from '../standard/StandardShell';
import { EDITORIAL_MAGAZINE_CONFIG, ARTICLE_DEFAULT_CONFIG } from '../../defaults';
import type { ThemeDefinition } from '../types';

export const editorialTheme: ThemeDefinition = {
  id: 'magazine',
  name: 'Editorial Magazine',
  description:
    'Inspiré par The New Yorker et The Atlantic. Grand article vedette et typographie à empattements.',
  defaultTokens: EDITORIAL_MAGAZINE_CONFIG.tokens,
  Shell: StandardShell,
  defaultLayouts: {
    home: EDITORIAL_MAGAZINE_CONFIG,
    article: ARTICLE_DEFAULT_CONFIG,
  },
};
