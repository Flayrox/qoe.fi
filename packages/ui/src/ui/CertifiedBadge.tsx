'use client';

import React from 'react';
import { t } from '@lingui/core/macro';

export function CertifiedBadge({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={t`Auteur certifié`}
      className={className}
    >
      <circle cx="7" cy="7" r="7" fill="var(--qoe-vermillion, #EE4B2B)" />
      <path
        d="M4.5 7L6.3 8.8L9.5 5.5"
        stroke="white"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
