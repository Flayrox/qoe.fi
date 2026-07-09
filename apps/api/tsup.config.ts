import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  // Bundle tous les packages @qoe/* workspace dans le build final
  // pour éviter les ERR_MODULE_NOT_FOUND en production Docker
  bundle: true,
  noExternal: [/^@qoe\//],
  // Ne pas bundler les dépendances natives (node_modules externes)
  external: [
    // Node.js builtins
    "node:*",
    // Dépendances npm normales (présentes dans node_modules)
    "@prisma/client",
    "hono",
    "@hono/node-server",
    "@hono/zod-validator",
    "stripe",
    "zod",
  ],
  splitting: false,
  sourcemap: false,
  clean: true,
  // Nécessaire pour les imports ESM
  target: "node20",
  shims: false,
});
