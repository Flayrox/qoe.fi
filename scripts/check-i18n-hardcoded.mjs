#!/usr/bin/env node
// Garde du lot L22j : aucune copie française affichée hors macro Lingui dans les
// surfaces studio converties (R138/R140/R143/R146/R149/R151).
//
// Usage: node scripts/check-i18n-hardcoded.mjs [--list]
//
// Détection : un lexique français (accents OU mots-outils) *et* une position de
// copie (texte JSX, attribut d'affichage, propriété de copie, argument de retour
// d'erreur, gabarit de message). Ce qui n'est pas de la copie est écarté par
// nature, pas par fichier : valeurs de contrat (`id`, `kind`, `type`, `status`…),
// opérandes de comparaison, clés d'accès de dictionnaire, tableaux de mots-clés de
// recherche, piles de polices CSS, chemins d'API et sélecteurs.
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

// Lexique de mots-outils et de vocabulaire d'interface : sert à reconnaître une
// chaîne française même sans accent (« Action », « lecteurs », « En attente »).
const FRENCH_WORDS = new Set(
  `titre titres brouillon brouillons publie publiee publies publiees apercu enregistrer enregistre
  supprimer supprime annuler valider confirmer fermer ouvrir ajouter modifier creer editer choisir
  selectionner rechercher charger reessayer continuer retour suivant precedent terminer envoyer
  recevoir partager copier coller lien liens compte comptes email mot passe connexion deconnexion
  inscription abonnement abonnes abonne lecteur lecteurs article articles page pages media medias
  image images video videos audio fichier fichiers dossier dossiers contenu contenus texte textes
  document documents theme themes couleur couleurs police polices logo banniere entete pied
  navigation menu rubrique rubriques section sections option options reglage reglages parametres
  preference preferences notification notifications message messages erreur erreurs succes
  avertissement information statut etat date heure jour jours semaine mois annee aujourd hui hier
  demain total aucun aucune tout tous toute toutes plus moins nouveau nouvelle nouveaux dernier
  derniere premiere premier actif active inactif inactives public publique prive privee visible
  invisible disponible indisponible requis obligatoire facultatif vide pleine chargement charge
  attente termine echec reussi refuse accepte approuve rejete revoque limite illimite gratuit
  payant pro equipe equipes membre membres invitation invitations collaborateur collaborateurs
  proprietaire admin administrateur role roles acces permission permissions cle cles jeton jetons
  api webhook webhooks application applications domaine sous-domaine redaction redactionnel
  commentaire commentaires moderation signaler signale bloque masque epingle vedette bref resume
  extrait source sources auteur auteurs publication publications audience audiences statistiques
  graphique graphiques visiteurs vues clics taux duree moyenne revenu revenus paiement paiements
  facture factures portail tarif tarifs offre offres fonctionnalites avantages changer passer gerer
  voir afficher masquer retirer deplacer dupliquer importer exporter telecharger televerser
  remplacer installer activer desactiver verifier verifie`.split(/\s+/)
);

// Positions qui peignent du texte : texte JSX, attributs d'affichage, propriétés de
// copie dans les tables d'options, gabarits de message.
const STRONG_FRENCH = new Set(
  `titre titre brouillon publiee publies apercu enregistrer enregistre supprimer supprime annuler
  valider confirmer fermer ouvrir ajouter modifier creer editer choisir selectionner rechercher
  charger reessayer continuer terminer envoyer recevoir partager copier coller compte comptes
  email passe connexion deconnexion inscription abonnement abonnes abonne lecteur lecteurs media
  medias fichiers contenu contenus texte textes documents theme themes couleur couleurs police
  polices logo banniere entete pied navigation menu rubrique rubriques reglage reglages parametres
  preference preferences notification notifications message messages erreur erreurs succes
  avertissement statut etat heure jour jours semaine mois annee aujourd hui hier demain total
  aucun aucune tout tous toute toutes moins nouveau nouvelle nouveaux dernier derniere premiere
  premier actif inactif disponible indisponible requis obligatoire facultatif chargement termine
  echec reussi refuse accepte approuve rejete revoque limite illimite gratuit payant equipe
  equipes membre membres invitation invitations collaborateur proprietaire administrateur acces
  permission permissions jeton jetons webhook webhooks domaine sous-domaine redaction redactionnel
  commentaire commentaires moderation signaler bloque masque epingle vedette resume extrait
  auteur auteurs publication publications audience statistiques graphique visiteurs clics taux
  duree moyenne revenu revenus paiement paiements facture factures portail tarif tarifs offre
  offres fonctionnalites avantages changer passer gerer voir afficher masquer retirer deplacer
  dupliquer importer exporter telecharger televerser remplacer installer activer desactiver
  verifier verifie impossible texte bouton badge section grille bloc calques visuels cadre zoom version couverture style pages extrait standard grand gauche verre arrondi large fixe hug fill sans desktop tablette mobile fit typographique carte lignes verrouiller recentrer avant mur abonnement accueil`.split(
    /\s+/
  )
);

const COPY_PROPS = new Set([
  'label',
  'detail',
  'description',
  'title',
  'subtitle',
  'placeholder',
  'alt',
  'message',
  'hint',
  'empty',
  'emptyLabel',
  'emptyHint',
  'summary',
  'tooltip',
  'heading',
  'legend',
  'ctaLabel',
  'confirmLabel',
  'cancelLabel',
  'body',
  'text',
  'note',
  'kicker',
  'helper',
  'helperText',
  'readOnlyHint',
]);
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
  'accept',
  'htmlSize',
  'tabIndex',
]);
const CONTRACT_PROPS = new Set([
  'id',
  'key',
  'kind',
  'type',
  'value',
  'status',
  'href',
  'src',
  'name',
  'className',
  'role',
  'slug',
  'event',
  'side',
  'variant',
  'tone',
  'size',
  'shape',
  'color',
  'hex',
  'family',
  'url',
  'path',
  'tab',
  'tabId',
  'page',
  'filename',
  'ext',
  'mime',
  'method',
  'accept',
  'target',
  'lang',
  'dir',
  'slot',
  'titleKey',
  'descriptionKey',
  'keywordsKey',
  'labelKey',
  'hash',
  'clientType',
  'publisherType',
  'relation',
  'column',
  'field',
  'route',
  'redirect',
  'mode',
  'level',
  'plan',
  'currency',
  'locale',
  'timezone',
  'format',
  'align',
  'layout',
  'position',
  'orientation',
  'scope',
  'permission',
  'capability',
  'feature',
  'channel',
  'provider',
  'platform',
  'source',
  'origin',
  'selector',
  'query',
  'search',
  'redirectTo',
  'next',
  'initialTab',
  'activeTab',
  'leftPanelTab',
  'stagePage',
  'action',
  'intent',
]);
const KEYWORD_PROP = /(key|keyword|synonym|alias|tag)s?$/i;
const ACCENT = /[àâäéèêëîïôöùûüçœÀÂÄÉÈÊËÎÏÔÖÙÛÜÇŒ]/;
const URLISH = /^(https?:|\/|#|mailto:|tel:|data:|application\/|image\/|text\/)/i;
const CSS_STACK = /sans-serif|serif|monospace|system-ui/;

const strip = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function frenchWords(text) {
  return strip(text)
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

// Un texte JSX est presque toujours de la copie : le lexique large suffit.
function isFrenchCopy(text) {
  const t = text.trim();
  if (!t) return false;
  if (ACCENT.test(t)) return true;
  if (URLISH.test(t)) return false;
  return frenchWords(t).some((w) => FRENCH_WORDS.has(w));
}

// Hors texte JSX (littéraux, gabarits) on exige un mot sans équivoque : « active »
// ou « article » y sont aussi des valeurs techniques et ne prouvent rien.
function isFrenchLiteral(text) {
  const t = text.trim();
  if (!t) return false;
  // Jeton technique : un identifiant en minuscules (« logo », « webhooks »,
  // « media:create_articles ») ou une valeur de contrat en capitales (« CONFIRMER »)
  // n'est pas de la copie, même si le mot existe en français.
  if (/^[a-z][a-z0-9:_-]*$/.test(t) && !ACCENT.test(t)) return false;
  if (/^[A-Z][A-Z0-9_:.-]*$/.test(t)) return false;
  // Clé de stockage/configuration pointée (« qoe.articles.list.views »).
  if (/^[a-z][a-z0-9]*(\.[\w-]+)+$/.test(t)) return false;
  if (ACCENT.test(t)) return true;
  if (URLISH.test(t)) return false;
  return frenchWords(t).some((w) => STRONG_FRENCH.has(w));
}

// Les métadonnées sont rendues hors du provider i18n : leur copie FR/EN est
// volontairement littérale (cf. generateMetadata du studio).
function inGenerateMetadata(node) {
  for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name?.getText() === 'generateMetadata') return true;
  }
  return false;
}

// Paire bilingue : l'autre branche porte déjà une macro, donc celle-ci est sa
// traduction littérale assumée.
function bilingualSibling(node) {
  const p = node.parent;
  if (!ts.isConditionalExpression(p)) return false;
  const other = p.whenTrue === node ? p.whenFalse : p.whenTrue;
  return /t`/.test(other.getText());
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

function insideMacro(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isTaggedTemplateExpression(p) && p.tag.getText() === 't') return true;
    if (ts.isCallExpression(p) && p.expression.getText() === 't' && p.arguments.includes(node))
      return true;
    if (ts.isSourceFile(p)) return false;
  }
  return false;
}

function keywordArray(node) {
  for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (
      ts.isPropertyAssignment(p) &&
      ts.isArrayLiteralExpression(p.initializer) &&
      KEYWORD_PROP.test(p.name.getText())
    )
      return true;
  }
  return false;
}

function comparisonOperand(node) {
  const p = node.parent;
  if (ts.isCaseClause(p)) return true;
  if (
    ts.isBinaryExpression(p) &&
    ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(p.operatorToken.getText())
  )
    return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  return false;
}

const files = [];
for (const z of ZONES) walk(path.join(ROOT, z), files);
const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const rel = path.relative(ROOT, file);
  const report = (node, kind) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const text = node.getText(sf).replace(/\s+/g, ' ');
    findings.push({
      rel,
      line: line + 1,
      col: character,
      kind,
      text: text.length > 90 ? text.slice(0, 87) + '…' : text,
    });
  };
  (function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) {
      const text = node.getText(sf).replace(/\s+/g, ' ').trim();
      // Un identifiant en capitales (« NEXT_PUBLIC_UMAMI_WEBSITE_ID ») n'est pas de la copie.
      if (isFrenchCopy(text) && !/^[A-Z][A-Z0-9_:.-]*$/.test(text)) report(node, 'jsx-text');
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      isFrenchLiteral(node.text) &&
      !insideMacro(node)
    ) {
      if (inGenerateMetadata(node) || bilingualSibling(node)) return;
      const p = node.parent;
      if (ts.isPropertyAssignment(p) && p.name === node) return;
      if (ts.isPropertySignature(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return;
      if (comparisonOperand(node) || keywordArray(node)) return;
      if (CSS_STACK.test(node.text)) return;
      if (ts.isPropertyAssignment(p)) {
        const name = p.name.getText();
        if (CONTRACT_PROPS.has(name) || name === 'family') return;
        if (COPY_PROPS.has(name)) report(node, 'prop:' + name);
        return;
      }
      if (ts.isJsxAttribute(p)) {
        const name = p.name.getText();
        if (NON_DISPLAY_ATTRS.has(name)) return;
        if (COPY_PROPS.has(name) || name.startsWith('aria-')) report(node, 'attr:' + name);
        return;
      }
      if (ts.isCallExpression(p)) {
        const callee = p.expression.getText();
        if (callee === 'require' || callee.startsWith('console.')) return;
        report(node, 'call:' + callee.split('.').pop());
        return;
      }
      if (ts.isJsxExpression(p)) {
        report(node, 'jsx-expr');
        return;
      }
      if (ts.isConditionalExpression(p)) {
        report(node, 'ternary');
        return;
      }
      if (
        ts.isReturnStatement(p) ||
        ts.isArrowFunction(p) ||
        ts.isVariableDeclaration(p) ||
        ts.isBinaryExpression(p)
      ) {
        report(node, 'value');
      }
    }
    if (ts.isTemplateExpression(node) && !insideMacro(node) && !comparisonOperand(node)) {
      const whole = node.getText(sf);
      const prose = node.head.text + node.templateSpans.map((s) => s.literal.text).join(' ');
      if (
        !/\? '' : 's'/.test(whole) &&
        !/\? 's' : ''/.test(whole) &&
        !whole.includes('://') &&
        isFrenchLiteral(prose) &&
        !inGenerateMetadata(node) &&
        !bilingualSibling(node)
      ) {
        report(node, 'template');
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
console.log(`\n${findings.length} copie(s) française(s) hors macro dans ${byFile.size} fichier(s)`);
for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${f}`);
process.exit(findings.length === 0 ? 0 : 1);
