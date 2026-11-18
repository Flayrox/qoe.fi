'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { t } from '@lingui/core/macro';
import { Button } from '../primitives/button/button';

export function ThemeToggle() {
  // ⚠️ `resolvedTheme`, pas `theme` : avec `defaultTheme="system"` (le défaut
  // de next-themes), `theme` vaut « system » et un premier clic sur le thème
  // sombre posait « dark » — aucun changement visible, il fallait cliquer
  // deux fois. On bascule sur le thème RÉELLEMENT affiché.
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="w-9 h-9" />;

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="sm"
      shape="icon"
      className="w-9 rounded-full"
      aria-label={t`Basculer le thème`}
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{t`Basculer le thème`}</span>
    </Button>
  );
}
