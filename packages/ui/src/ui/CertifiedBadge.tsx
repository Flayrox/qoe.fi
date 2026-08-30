import React from 'react';
import { t } from '@lingui/core/macro';

export interface CertifiedBadgeProps {
  size?: number | string;
  className?: string;
  title?: string;
}

export function CertifiedBadge({
  size = 14,
  className = '',
  title = t`Auteur certifié`,
}: CertifiedBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
      title={title}
      aria-label={title || t`Auteur certifié`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <circle cx="7" cy="7" r="7" fill="var(--qoe-vermillion, #EE4B2B)" />
        <path
          d="M4.2 7.2L5.9 8.9L9.8 5"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
