// =====================================================================
// style.ts — résolveur souverain BlockStyleProps → CSSProperties
// Porté d'Onlook editor-bar (Box/Text/Dimension/Color) sans Tailwind AST.
// =====================================================================

import type React from 'react';
import type { BlockStyleProps } from './schema';

function sidesToCss(
  v: BlockStyleProps['padding'],
  kind: 'padding' | 'margin'
): React.CSSProperties {
  if (!v || typeof v !== 'object') return {};
  const unit = v.unit ?? 'px';
  const t = v.top ?? 0;
  const r = v.right ?? 0;
  const b = v.bottom ?? 0;
  const l = v.left ?? 0;
  if (t === 0 && r === 0 && b === 0 && l === 0) return {};
  const fmt = (n: number) => `${n}${unit}`;
  if (kind === 'padding') return { padding: `${fmt(t)} ${fmt(r)} ${fmt(b)} ${fmt(l)}` };
  return { margin: `${fmt(t)} ${fmt(r)} ${fmt(b)} ${fmt(l)}` };
}

export function resolveBlockStyle(style?: BlockStyleProps): React.CSSProperties {
  if (!style) return {};
  const css: React.CSSProperties = {};
  Object.assign(css, sidesToCss(style.padding, 'padding'));
  const m = style.margin;
  if (m && typeof m === 'object') {
    if (m.auto) {
      css.marginLeft = 'auto';
      css.marginRight = 'auto';
    } else {
      Object.assign(css, sidesToCss(m, 'margin'));
    }
  }
  const bw = style.borderWidth;
  if (typeof bw === 'number' && bw > 0) css.borderWidth = `${bw}px`;
  else if (bw && typeof bw === 'object') {
    const unit = 'px';
    if (bw.top !== undefined) css.borderTopWidth = `${bw.top}${unit}`;
    if (bw.right !== undefined) css.borderRightWidth = `${bw.right}${unit}`;
    if (bw.bottom !== undefined) css.borderBottomWidth = `${bw.bottom}${unit}`;
    if (bw.left !== undefined) css.borderLeftWidth = `${bw.left}${unit}`;
  }
  if (style.borderColor) {
    css.borderColor = style.borderColor;
    if (!css.borderWidth && !css.borderStyle) {
      css.borderWidth = 1;
      css.borderStyle = 'solid';
    }
  }
  const r = style.radius;
  if (typeof r === 'number') css.borderRadius = r >= 9999 ? 9999 : r;
  else if (r && typeof r === 'object') {
    const tl = r.topLeft ?? 0;
    const tr = r.topRight ?? 0;
    const br = r.bottomRight ?? 0;
    const bl = r.bottomLeft ?? 0;
    if (tl || tr || br || bl) {
      css.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }
  if (style.display) css.display = style.display;
  if (style.flexDirection) css.flexDirection = style.flexDirection;
  if (style.alignItems) css.alignItems = style.alignItems;
  if (style.justifyContent) css.justifyContent = style.justifyContent;
  if (style.gap !== undefined) css.gap = style.gap;
  if (style.width) {
    if (style.width.mode === 'fill') css.width = '100%';
    else if (style.width.mode === 'hug') css.width = 'auto';
    else if (typeof style.width.value === 'number') css.width = style.width.value;
    if (typeof style.width.min === 'number') css.minWidth = style.width.min;
    if (typeof style.width.max === 'number') css.maxWidth = style.width.max;
  }
  if (style.height) {
    if (style.height.mode === 'fill') css.height = '100%';
    else if (style.height.mode === 'hug') css.height = 'auto';
    else if (typeof style.height.value === 'number') css.height = style.height.value;
    if (typeof style.height.min === 'number') css.minHeight = style.height.min;
    if (typeof style.height.max === 'number') css.maxHeight = style.height.max;
  }
  if (style.opacity !== undefined) css.opacity = Math.min(100, Math.max(0, style.opacity)) / 100;
  if (style.background) {
    if (style.background.gradientCss) css.backgroundImage = style.background.gradientCss;
    else if (style.background.color) {
      css.backgroundColor = style.background.color;
      if (style.background.alpha !== undefined && style.background.alpha < 100) {
        css.opacity = css.opacity ?? style.background.alpha / 100;
      }
    }
  }
  if (style.objectFit) css.objectFit = style.objectFit;
  const f = style.font;
  if (f) {
    if (f.family) css.fontFamily = f.family;
    if (f.size !== undefined) css.fontSize = f.size;
    if (f.weight !== undefined) css.fontWeight = f.weight as React.CSSProperties['fontWeight'];
    if (f.color) css.color = f.color;
    if (f.align) css.textAlign = f.align;
    if (f.lineHeight !== undefined) css.lineHeight = f.lineHeight;
    if (f.letterSpacing !== undefined) css.letterSpacing = f.letterSpacing;
    if (f.transform && f.transform !== 'none') css.textTransform = f.transform;
    if (f.decoration && f.decoration !== 'none') css.textDecorationLine = f.decoration;
  }
  if (style.styleBox) {
    if (Number(style.styleBox.pt ?? 0) > 0) css.paddingTop = style.styleBox.pt;
    if (Number(style.styleBox.pb ?? 0) > 0) css.paddingBottom = style.styleBox.pb;
    if (Number(style.styleBox.maxWidth ?? 0) > 0) {
      css.maxWidth = style.styleBox.maxWidth;
      css.marginLeft = 'auto';
      css.marginRight = 'auto';
    }
    if (style.styleBox.opacity !== undefined && Number(style.styleBox.opacity) < 100) {
      css.opacity = Number(style.styleBox.opacity) / 100;
    }
  }
  return css;
}

export function isStyleEmpty(style?: BlockStyleProps): boolean {
  if (!style) return true;
  return Object.keys(resolveBlockStyle(style)).length === 0;
}
