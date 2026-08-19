import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

// The Next.js ruleset (eslint-config-next) is only valid for Next.js apps.
// Packages are plain TypeScript and must not load the Next config (it emits
// a "Pages directory cannot be found" warning outside of a Next app).
const nextApps = ['apps/admin', 'apps/studio', 'apps/core', 'apps/hi', 'apps/tenants'];

// Scope a Next config object to the Next app directories, keeping its
// original `files` semantics intact. Configs that only carry `ignores`
// are dropped (their ignores are merged into globalIgnores below).
function scopeNextConfig(cfg, appFiles) {
  const scoped = { ...cfg };
  if (cfg.files) {
    scoped.files = appFiles.flatMap((app) => cfg.files.map((p) => p.replace(/^\*\*\//, `${app}/`)));
  } else {
    // Configs without `files` (e.g. plugin registration in eslint-config-next)
    // apply to the whole repo by default; scope them to the Next apps only.
    scoped.files = appFiles.map((app) => `${app}/**/*.{js,jsx,mjs,ts,tsx,mts,cts}`);
  }
  return scoped;
}

const nextIgnores = [...nextVitals, ...nextTs]
  .filter((cfg) => cfg.ignores)
  .flatMap((cfg) => cfg.ignores);

const eslintConfig = defineConfig([
  // ---- Next.js apps (eslint-config-next) ----
  ...nextVitals.map((cfg) => scopeNextConfig(cfg, nextApps)).filter(Boolean),
  ...nextTs.map((cfg) => scopeNextConfig(cfg, nextApps)).filter(Boolean),

  // ---- Plain TypeScript (packages, e2e) ----
  // Scoped to non-Next directories: the Next apps get their own stricter
  // ruleset from eslint-config-next above.
  {
    files: [
      'packages/**/*.ts',
      'packages/**/*.tsx',
      'e2e/**/*.ts',
      'e2e/**/*.tsx',
      'apps/api/**/*.ts',
      'apps/api/**/*.tsx',
      'apps/collab-server/**/*.ts',
      'apps/collab-server/**/*.tsx',
    ],
    ...tseslint.configs.recommended[0],
  },
  {
    files: [
      'packages/**/*.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'apps/api/**/*.{ts,tsx}',
      'apps/collab-server/**/*.{ts,tsx}',
    ],
    rules: tseslint.configs.recommended[1].rules,
    name: tseslint.configs.recommended[1].name,
  },
  {
    files: [
      'packages/**/*.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'apps/api/**/*.{ts,tsx}',
      'apps/collab-server/**/*.{ts,tsx}',
    ],
    rules: tseslint.configs.recommended[2].rules,
    name: tseslint.configs.recommended[2].name,
  },

  // ---- Custom rule (all TS files) ----
  {
    plugins: {
      custom: {
        rules: {
          'no-raw-tailwind-colors': {
            meta: {
              type: 'problem',
              docs: {
                description:
                  'Forbid raw color classes from Tailwind in favor of semantic tokens from @qoe/theme',
              },
              schema: [],
            },
            create(context) {
              const filename = context.getFilename();
              if (
                filename.includes('packages/theme') ||
                filename.includes('node_modules') ||
                filename.includes('dist') ||
                filename.includes('.next') ||
                filename.endsWith('.json') ||
                filename.endsWith('.css')
              ) {
                return {};
              }

              const forbiddenColorPattern =
                /\b(?:text|bg|border|ring|divide|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/g;

              function checkString(node, text) {
                if (typeof text !== 'string') return;
                const matches = text.match(forbiddenColorPattern);
                if (matches && matches.length > 0) {
                  context.report({
                    node,
                    message: `Anti-pattern: Raw Tailwind color class(es) found: "${matches.join(', ')}". Use semantic tokens from @qoe/theme instead (e.g., text-foreground, bg-muted, border-border). See apps/studio/STYLE.md.`,
                  });
                }
              }

              return {
                Literal(node) {
                  if (typeof node.value === 'string') {
                    checkString(node, node.value);
                  }
                },
                TemplateElement(node) {
                  if (node.value && node.value.raw) {
                    checkString(node, node.value.raw);
                  }
                },
              };
            },
          },
        },
      },
    },
    rules: {
      'custom/no-raw-tailwind-colors': 'error',
    },
  },

  // ---- Next.js apps: disable `no-html-link-for-pages` ----
  // The rule targets the legacy pages/ router; this repo uses the App Router.
  // Declared after eslint-config-next so it takes precedence.
  {
    files: nextApps.map((app) => `${app}/**/*.{ts,tsx}`),
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // ---- Ignored paths (kept in sync with .prettierignore) ----
  globalIgnores([
    // Build outputs (at any nesting level, e.g. apps/core/.next)
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.turbo/**',
    // Dependencies & caches
    '**/node_modules/**',
    '**/.pnpm-store/**',
    '**/.agents/**',
    // Reference codebases (Bluesky, Ghost) - never linted
    '.reference/**',
    // Generated files
    '**/next-env.d.ts',
    '**/*.tsbuildinfo',
    // Lingui compiled catalogs (messages/*.js) — générés par lingui compile,
    // formatés par prettier via pnpm intl:compile. Ignorés ici pour que le
    // commentaire /*eslint-disable*/ de Lingui ne soit pas retiré par --fix.
    'messages/**',
    // Native / vendored binaries
    '**/*.rar',
    // Default ignores shipped by eslint-config-next
    ...nextIgnores,
  ]),
]);

export default eslintConfig;
