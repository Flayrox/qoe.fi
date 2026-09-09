'use client';

// ═══════════════════════════════════════════════════════════════════
// 🏅 @qoe/ui — CertifiedBadge.tsx
// Rendu officiel délégué vers @qoe/brand avec support i18n Lingui.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { t } from '@lingui/core/macro';
import {
  CertifiedBadge as BrandCertifiedBadge,
  type CertifiedBadgeProps as BrandProps,
} from '@qoe/brand';

export type CertifiedBadgeProps = BrandProps;

export function CertifiedBadge({ size = 14, className = '', title }: CertifiedBadgeProps) {
  const resolvedTitle = title || t`Auteur certifié`;
  return <BrandCertifiedBadge size={size} className={className} title={resolvedTitle} />;
}

export { BrandCertifiedBadge };
