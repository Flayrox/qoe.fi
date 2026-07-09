import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      custom: {
        rules: {
          "no-raw-tailwind-colors": {
            meta: {
              type: "problem",
              docs: {
                description: "Forbid raw color classes from Tailwind in favor of semantic tokens from @qoe/theme",
              },
              schema: [],
            },
            create(context) {
              const filename = context.getFilename();
              if (
                filename.includes("packages/theme") ||
                filename.includes("node_modules") ||
                filename.includes("dist") ||
                filename.includes(".next") ||
                filename.endsWith(".json") ||
                filename.endsWith(".css")
              ) {
                return {};
              }

              const forbiddenColorPattern = /\b(?:text|bg|border|ring|divide|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/g;

              function checkString(node, text) {
                if (typeof text !== "string") return;
                const matches = text.match(forbiddenColorPattern);
                if (matches && matches.length > 0) {
                  context.report({
                    node,
                    message: `Anti-pattern: Raw Tailwind color class(es) found: "${matches.join(", ")}". Use semantic tokens from @qoe/theme instead (e.g., text-foreground, bg-muted, border-border). See apps/dashboard/STYLE.md.`,
                  });
                }
              }

              return {
                Literal(node) {
                  if (typeof node.value === "string") {
                    checkString(node, node.value);
                  }
                },
                TemplateElement(node) {
                  if (node.value && node.value.raw) {
                    checkString(node, node.value.raw);
                  }
                }
              };
            }
          }
        }
      }
    },
    rules: {
      "custom/no-raw-tailwind-colors": "error"
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
