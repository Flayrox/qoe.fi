// =====================================================================
// 📦 @qoe/ui — Re-exports
// =====================================================================

export * from "./tokens";
export { Button, buttonVariants } from "./button";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";

// 📖 Note : les autres composants shadcn (sheet, dialog, dropdown, etc.)
// seront migrés progressivement depuis src/components/ui/ vers ce package.
// Pour l'instant, on garde src/components/ui/ dans l'app console (Phase 3).
