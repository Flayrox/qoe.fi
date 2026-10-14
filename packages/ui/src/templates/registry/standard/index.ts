import { StandardShell } from './StandardShell';
import { BENTO_TECH_CONFIG, ARTICLE_DEFAULT_CONFIG } from '../../defaults';
import type { ThemeDefinition } from '../types';

export const standardTheme: ThemeDefinition = {
  id: 'standard',
  name: 'Standard Classic',
  description: 'Mise en page polyvalente avec grille moderne et navigation étendue.',
  defaultTokens: BENTO_TECH_CONFIG.tokens,
  Shell: StandardShell,
  defaultLayouts: {
    home: BENTO_TECH_CONFIG,
    article: ARTICLE_DEFAULT_CONFIG,
  },
};
