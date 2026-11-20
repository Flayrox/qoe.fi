// =====================================================================
// types.ts — Types de Qoefi Stage
// =====================================================================

import type {
  LayoutConfig,
  TemplatePublisherContext,
  TemplateArticleItem,
} from '@qoe/ui/templates';
import type { SidebarProps } from '@qoe/ui/sidebar';

export type StageDevice = 'desktop' | 'tablet' | 'mobile';

export type StageMode = 'design' | 'preview';

export interface StageCanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export interface StageClientProps {
  publisher: TemplatePublisherContext;
  articles: TemplateArticleItem[];
  sidebarProps?: SidebarProps;
  /** Brouillon serveur : prime sur layoutStyle (publié) au chargement. */
  initialDraft?: string | null;
}

export const DEVICE_DIMENSIONS: Record<
  StageDevice,
  { width: number; label: string; icon: string }
> = {
  desktop: { width: 1280, label: 'Desktop', icon: 'Monitor' },
  tablet: { width: 768, label: 'Tablette', icon: 'Tablet' },
  mobile: { width: 390, label: 'Mobile', icon: 'Smartphone' },
};
