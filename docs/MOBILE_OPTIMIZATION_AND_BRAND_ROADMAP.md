# 📱 Feuille de Route d'Optimisation & Branding Mobile (Apps / Mobile)

Ce document répertorie l'ensemble des ajustements, optimisations de poids de binaire (bundle size) et remplacement des assets temporaires à appliquer lors des prochains patchs de l'application mobile [`apps/mobile`](../apps/mobile).

---

## 1. 🎨 Identité Visuelle & Remplacement des Placeholders

Plusieurs assets actuels proviennent encore du template de démarrage Expo / React Native et doivent être remplacés par les ressources officielles du package partagé [`@qoe/brand`](../packages/brand) :

- [ ] **Icône d'application iOS & Android** :
  - Remplacer `assets/images/icon.png` (800 Ko) par le logo officiel Qoe vectorisé et exporté aux résolutions cibles (1024x1024 px).
  - Configurer `assets/images/android-icon-foreground.png` et `android-icon-background.png` avec le glyphe officiel de la marque.
- [ ] **Écran de démarrage (Splash Screen)** :
  - Remplacer le placeholder `assets/images/splash-icon.png` par le logotype épuré de Qoe sur fond sombre/clair thémé.
- [ ] **Nettoyage des fichiers temporaires Expo** :
  - Supprimer les fichiers inutilisés : `react-logo.png`, `react-logo@2x.png`, `react-logo@3x.png`, `expo-badge.png`, `expo-badge-white.png`, `expo-logo.png`, `tutorial-web.png`.

---

## 2. 🪶 Optimisation du Poids d'Installation (Bundle & Binaire)

L'objectif est de maintenir le téléchargement store en-dessous de **15-20 Mo** pour un premier chargement quasi-instantané.

### A. Compression des Images
- [ ] **Passe de compression sans perte** :
  - Passer les assets restants dans `oxipng` ou `pngquant` pour réduire de 60 à 75 % le poids des PNG existants (notamment `logo-glow.png` qui pèse actuellement ~330 Ko).
  - Privilégier les SVG via `react-native-svg` pour tous les pictogrammes d'interface plutôt que des bitmaps.

### B. Élagage des Polices Vectorielles (`@expo/vector-icons`)
- [ ] `@expo/vector-icons` embarque par défaut plusieurs fichiers de polices TTF lourds (Ionicons, MaterialIcons, FontAwesome, etc.).
- [ ] **Action** :
  - Standardiser l'interface sur `lucide-react-native` (déjà installé et tree-shakable) et `expo-symbols` (SF Symbols natifs sur iOS sans aucun surcoût de police).
  - Configurer le bundler Metro pour exclure les polices TTF inutilisées de l'archive finale.

---

## 3. ⚙️ Configuration de Production (`app.json`)

Préparer la publication sur les stores (Google Play & Apple App Store) :

- [ ] **Identifiants de bundle officiels** :
  - iOS `bundleIdentifier` : passer de `com.anonymous.qoe-mobile` à `fi.qoe.mobile` (ou domaine réservé de production).
  - Android `package` : passer de `com.anonymous.qoemobile` à `fi.qoe.mobile`.
- [ ] **Gestion des versions & OTA** :
  - Aligner `version` (actuellement `0.0.0`) avec le numéro de version de publication (ex: `1.0.0`).
  - Valider la chaîne de signature de certificats pour `expo-updates` (`./certs/certificate.pem`).
- [ ] **Permissions minimales** :
  - Vérifier que seules les permissions indispensables (Haptics, Share, Camera/Picker pour avatar) sont déclarées dans les manifests Android et plist iOS.

---

## 4. 🚀 Performance Moteur & RAM (Validation Déjà Réalisée)

- ✅ **React Native New Architecture** activée (`newArchEnabled: true` avec Fabric et TurboModules en C++).
- ✅ **React Compiler 19** activé (`experiments.reactCompiler: true`).
- ✅ **Moteur Hermes** avec compilation binaire bytecode (`.hbc`) au build.
- ✅ **Moteurs partagés unifiés** : `@qoe/content` (modèle continu C1 sans surcharge DOM), `@qoe/formatters` et `@qoe/social` (algorithmes $O(N)$ légers en RAM).
