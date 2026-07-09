import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  // Bundle tous les packages @qoe/* workspace dans le build final
  bundle: true,
  noExternal: [/^@qoe\//],
  // Ne pas bundler les dépendances npm externes
  external: [
    "node:*",
    "bullmq",
    "ioredis",
    "@prisma/client",
  ],
  splitting: false,
  sourcemap: false,
  clean: true,
  target: "node20",
  shims: false,
});
