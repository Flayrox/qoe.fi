#!/usr/bin/env node
// Garde reproductible du lot L22j : aucune chaîne user-facing française codée en
// dur dans les surfaces studio converties (R138/R140/R143/R146/R149/R151).
//
// Usage: node scripts/check-i18n-hardcoded.mjs [--list]
// Sortie: 0 si aucun littéral fautif, 1 sinon.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const ZONES = [
  'apps/studio/src/features/stage',
  'apps/studio/src/features/editor',
  'apps/studio/src/features/settings',
  'apps/studio/src/app/(creator)',
  'apps/studio/src/features/security',
  'apps/studio/src/features/onboarding',
  'apps/studio/src/features/upcoming',
  'apps/studio/src/features/dashboard',
  'apps/studio/src/features/developer',
  'apps/studio/src/features/devtools',
  'apps/studio/src/app/login',
  'apps/studio/src/app/onboarding',
];
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'vendor', '.next']);
// Attributs/positions qui ne peignent pas de texte.
const NON_DISPLAY_ATTRS = new Set([
  'className',
  'id',
  'href',
  'src',
  'type',
  'name',
  'role',
  'key',
  'htmlFor',
  'd',
  'fill',
  'stroke',
  'viewBox',
  'variant',
  'tone',
  'size',
  'shape',
  'value',
  'method',
  'target',
  'rel',
  'as',
  'slot',
  'lang',
  'dir',
  'action',
  'data-testid',
]);
// Tableaux de mots-clés de recherche : des jetons d'index, pas de la copie affichée.
const KEYWORD_PROP = /(key|keyword|synonym|alias|tag)s?$/i;
const ACCENT = /[àâäéèêëîïôöùûüçœÀÂÄÉÈÊËÎÏÔÖÙÛÜÇŒ]/;
const STOPWORD =
  /\b(le|la|les|des|du|un|une|au|aux|ce|cet|cette|ces|mon|ma|mes|votre|vos|notre|nos|leur|leurs|pour|avec|sans|sur|dans|par|plus|moins|tout|tous|toute|toutes|aucun|aucune|est|sont|être|fait|faire|qui|que|quoi|dont|où|et|ou|mais|donc|car|si|ne|pas|jamais|déjà|encore|très|bien|nouveau|nouvelle|dernier|dernière|premier|première|article|articles|page|compte|contenu|brouillon|publié|publiée)\b/i;

function isFrench(text) {
  const t = text.trim();
  if (!t) return false;
  if (ACCENT.test(t)) return true;
  if (/\s/.test(t) && STOPWORD.test(t)) return true;
  // un mot capitalisé isolé n'est pas distinguable d'un jeton technique : on ne
  // le compte que s'il porte un accent (traité plus haut).
  return false;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(p) || /\.test\./.test(p)) continue;
    out.push(p);
  }
}

function alreadyTranslated(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isTaggedTemplateExpression(p) && p.tag.getText() === 't') return true;
    if (ts.isCallExpression(p) && p.expression.getText() === 't' && p.arguments.includes(node))
      return true;
    if (ts.isSourceFile(p)) return false;
  }
  return false;
}

const files = [];
for (const z of ZONES) walk(path.join(ROOT, z), files);
const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const rel = path.relative(ROOT, file);
  const inFunction = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionLike(p)) return true;
      if (ts.isSourceFile(p)) return false;
    }
    return false;
  };
  const report = (node, kind) => {
    const text = node.getText(sf);
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({
      rel,
      line: line + 1,
      kind: (inFunction(node) ? '' : 'M:') + kind,
      text: text.length > 90 ? text.slice(0, 87) + '…' : text,
    });
  };
  (function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) {
      const text = node.getText(sf).replace(/\s+/g, ' ').trim();
      if (isFrench(text)) report(node, 'jsx-text');
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      isFrench(node.text)
    ) {
      const parent = node.parent;
      if (ts.isPropertyAssignment(parent) && parent.name === node) return;
      if (ts.isPropertySignature(parent)) return;
      if (ts.isPropertyAssignment(parent) && parent.name.getText() === 'family') return; // pile CSS
      if (/sans-serif|serif|monospace|system-ui/.test(node.text)) return;
      {
        let p = node.parent;
        while (p && !ts.isSourceFile(p)) {
          if (
            ts.isPropertyAssignment(p) &&
            ts.isArrayLiteralExpression(p.initializer) &&
            KEYWORD_PROP.test(p.name.getText())
          )
            return;
          p = p.parent;
        }
      }
      if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return;
      if (!alreadyTranslated(node)) {
        if (ts.isJsxAttribute(parent)) {
          const attr = parent.name.getText();
          if (NON_DISPLAY_ATTRS.has(attr)) return;
          report(node, `attr:${attr}`);
        } else if (ts.isCallExpression(parent)) {
          const callee = parent.expression.getText();
          if (
            callee === 'console.log' ||
            callee === 'console.warn' ||
            callee === 'console.error' ||
            callee.startsWith('console.')
          )
            return;
          if (callee === 'require') return;
          report(node, `call:${callee.slice(0, 24)}`);
        } else if (ts.isJsxExpression(parent)) {
          report(node, 'jsx-expr');
        } else if (ts.isConditionalExpression(parent)) {
          report(node, 'ternary');
        } else if (ts.isPropertyAssignment(parent)) {
          report(node, `prop:${parent.name.getText()}`);
        } else if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
          return; // clé de dictionnaire
        } else if (ts.isCaseClause(parent) || ts.isCaseOrDefaultClause?.(parent)) {
          return;
        } else if (
          ts.isBinaryExpression(parent) &&
          ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(parent.operatorToken.getText())
        ) {
          return; // comparaison, pas de la copie
        } else if (
          ts.isVariableDeclaration(parent) ||
          ts.isReturnStatement(parent) ||
          ts.isBinaryExpression(parent)
        ) {
          report(node, 'assign');
        } else {
          report(node, 'other');
        }
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
}
const byFile = new Map();
for (const f of findings) byFile.set(f.rel, (byFile.get(f.rel) ?? 0) + 1);
if (process.argv.includes('--list')) {
  for (const f of findings) console.log(`${f.rel}:${f.line} [${f.kind}] ${f.text}`);
}
console.log(`\n${findings.length} littéraux user-facing non traduits dans ${byFile.size} fichiers`);
for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${f}`);
process.exit(findings.length === 0 ? 0 : 1);
