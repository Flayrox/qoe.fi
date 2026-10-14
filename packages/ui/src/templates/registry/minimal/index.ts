import { MinimalCraftShell } from '../../archetypes/minimal';
import { MINIMAL_PORTFOLIO_CONFIG, MINIMAL_ARTICLE_CONFIG } from '../../defaults/minimal';
import type { ThemeDefinition } from '../types';

export const minimalTheme: ThemeDefinition = {
  id: 'minimal',
  name: 'Minimal Craft',
  description:
    'Design suisse feutré inspiré par Devouring Details et Rauno Freiberg. Tiroir latéral de précision et typographie calibrée.',
  defaultTokens: MINIMAL_PORTFOLIO_CONFIG.tokens,
  Shell: MinimalCraftShell,
  defaultLayouts: {
    home: MINIMAL_PORTFOLIO_CONFIG,
    article: MINIMAL_ARTICLE_CONFIG,
  },
  suppressInternalNavbar: true,
};
