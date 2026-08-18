// Référence les types Expo (déclarations ambient des modules CSS : *.module.css,
// *.css, *.sass…) sans les dupliquer.
//
// Le fichier racine `expo-env.d.ts` fait le même référencement mais est généré
// par `expo start` et gitignoré : en CI (checkout propre), il n'existe pas →
// `tsc` échoue sur `import classes from '*.module.css'` (TS2307) et sur les
// imports CSS (TS2882). Ce fichier versionné garantit que les types sont
// toujours résolus, en local comme en CI (les références dupliquées vers le
// même fichier de types sont dédupliquées par TypeScript).
/// <reference types="expo/types" />
