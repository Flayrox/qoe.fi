"use client";

// ═══════════════════════════════════════════════════════════════════
// 🌗 @qoe/theme — ThemeProvider.tsx
// Wrapper next-themes (light/dark/system), source unique pour toutes les apps.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Silence le faux positif React 19 sur les <script> en dev
// (next-themes en injecte un pour éviter le FOUC).
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag while rendering React component")
    ) {
      return;
    }
    orig.apply(console, args);
  };
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
