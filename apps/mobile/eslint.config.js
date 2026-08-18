// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // ── Règles react-hooks v7 (orientées React Compiler) désactivées ──
    // Ces règles sont activées par défaut par eslint-config-expo mais
    // produisent des faux positifs avec des patterns RN idiomatiques :
    //   - react-hooks/immutability : reanimated exige de MUTER `.value`
    //     des shared values (API officielle) — le lint le voit comme une
    //     mutation interdite.
    //   - react-hooks/refs : `useRef(...).current` lu pendant le render
    //     (pattern Animated classique, ex: toast) est signalé à tort.
    //   - react-hooks/globals : l'API impérative module-level du toast
    //     (globalShow/globalDismiss) réassigne une variable hors composant.
    //   - react-hooks/set-state-in-effect : synchro d'état depuis des
    //     données fetch (setFollowing après chargement du profil).
    // NB : react-hooks/rules-of-hooks reste ACTIVE (les vrais bugs d'ordre
    // de hooks doivent être corrigés, pas masqués).
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
