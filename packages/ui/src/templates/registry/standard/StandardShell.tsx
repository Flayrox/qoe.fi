import React from 'react';
import type { ThemeShellProps } from '../types';

export function StandardShell({ children, className = '', style }: ThemeShellProps) {
  return (
    <div
      style={style}
      className={`min-h-screen bg-background text-foreground transition-colors selection:bg-[var(--tenant-accent)] selection:text-white ${className}`}
    >
      {children}
    </div>
  );
}
