'use client';

import React, { useEffect, useState } from 'react';

export interface ClientDateProps {
  date: Date | string | number;
  format?: 'relative' | 'short' | 'long' | 'time';
  locale?: string;
  className?: string;
  fallback?: string;
}

export function ClientDate({
  date,
  format = 'short',
  locale = 'fr-FR',
  className,
  fallback = '—',
}: ClientDateProps) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        setFormatted(fallback);
        return;
      }

      if (format === 'time') {
        setFormatted(
          d.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
          })
        );
      } else if (format === 'long') {
        setFormatted(
          d.toLocaleDateString(locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        );
      } else {
        setFormatted(
          d.toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        );
      }
    } catch {
      setFormatted(fallback);
    }
  }, [date, format, locale, fallback]);

  return (
    <time
      dateTime={typeof date === 'string' ? date : new Date(date).toISOString()}
      className={className}
      suppressHydrationWarning
    >
      {formatted || fallback}
    </time>
  );
}
