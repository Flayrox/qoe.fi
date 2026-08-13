// =====================================================================
// 🎨 cn — Class name merger (tw + clsx)
// =====================================================================
// 📖 Combine clsx (conditions) et tailwind-merge (dédupe des classes Tailwind)
//    C'est LE helper de référence pour les composants shadcn/ui.
// =====================================================================

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 🧩 Fusionne des classes CSS avec support des conditions.
 *
 * @example
 *   cn("px-4 py-2", isActive && "bg-blue-500", "px-6")
 *   // → "py-2 bg-blue-500 px-6" (px-4 dédupliqué par tailwind-merge)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
