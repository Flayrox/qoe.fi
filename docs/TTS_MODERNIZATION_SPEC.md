# 🎙️ Spécification Technique : Modernisation du Text-To-Speech (TTS) & Parité Web ↔ Mobile

> **Statut** : Approuvé pour conception & implémentation.  
> **Plateformes cibles** : Web (`apps/core`, `@qoe/ui`) & Mobile Natif (`apps/mobile` - React Native / Expo).  
> **Objectif** : Transformer l'écoute d'articles sur Qoe.fi en une expérience audio haut de gamme, fluide et interactive (comparable à Audible, Medium ou Artifact).

---

## 📑 Sommaire

1. [Vision & Piliers d'Expérience](#1-vision--piliers-dexpérience)
2. [Architecture Technique Partagée](#2-architecture-technique-partagée)
3. [Spécification Web (`apps/core` & `@qoe/ui`)](#3-spécification-web-appscore--qoeui)
4. [Spécification Mobile (`apps/mobile` React Native)](#4-spécification-mobile-appsmobile-react-native)
5. [Contrôles Système, Écran Verrouillé & Écouteurs](#5-contrôles-système-écran-verrouillé--écouteurs)
6. [Plan de Déploiement & Étapes d'Implémentation](#6-plan-de-déploiement--étapes-dimplémentation)

---

## 1. Vision & Piliers d'Expérience

L'expérience d'écoute ne doit pas être un simple flux audio passif, mais une **interface synchronisée bidirectionnelle** entre le texte et la voix :

- **🎯 Click-to-Listen** : Démarrer ou sauter la lecture directement depuis n'importe quel paragraphe, mot ou sélection.
- **⚡ Karaoké Visuel & Auto-Scroll** : Suivi visuel du bloc/mot actuellement prononcé avec défilement fluide et centré dans l'écran.
- **⏱️ Scrubber & Mini-Player Flottant** : Visualisation du temps restant, du paragraphe en cours (ex: *§ 4 / 18*) et sauts rapides `⏪ 15s` / `⏩ 15s`.
- **📱 Contrôles Arrière-plan & Lockscreen** : Continuer l'écoute lorsque l'application passe en arrière-plan ou que l'écran est verrouillé (AirPods, Apple Watch, Control Center iOS, MediaStyle Android).
- **🎛️ Personnalisation Audio** : Vitesse d'élocution préservant le pitch (`0.75x` à `2.0x`) et détection intelligente de la langue avec voix naturelles.

---

## 2. Architecture Technique Partagée

### Modèle de données canonique pour l'Audio
Chaque article est segmenté en une liste ordonnée de **blocs audio (`AudioParagraph`)** dérivée du contenu structuré :

```typescript
export interface AudioParagraph {
  id: string;              // Identifiant unique du bloc (ex: 'block-0', 'para-3')
  text: string;            // Texte pur nettoyé du HTML/Markdown
  offsetStart?: number;    // Offset de début dans le document canonique
  offsetEnd?: number;      // Offset de fin dans le document canonique
  approximateDurationMs: number; // Durée estimée selon le WPM (mots par minute)
}

export interface AudioPlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentParagraphIndex: number;
  totalParagraphs: number;
  currentWordOffset?: number;
  playbackRate: number;    // 0.75, 1.0, 1.25, 1.5, 1.75, 2.0
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
}
```

---

## 3. Spécification Web (`apps/core` & `@qoe/ui`)

### 3.1 Moteur de Synthèse Vocale
- Utilisation de l'API standard `window.speechSynthesis` et `SpeechSynthesisUtterance`.
- Extraction propre des paragraphes via `#article-content` ou les blocs `CanonicalDocument`.
- Écoute de l'événement `utterance.onboundary` pour capturer l'index exact du mot (`event.charIndex`) et déclencher le surlignage mot-à-mot / phrase-par-phrase.

### 3.2 UI Web & Interactions
1. **Click-to-Listen** :
   - Survol desktop : icône discrète `Play` en marge gauche de chaque paragraphe (`opacity-0 group-hover:opacity-100`).
   - Double-clic : commence la lecture immédiatement au paragraphe cliqué.
   - Popover de sélection de texte (`TextSelectionPopover.tsx`) : bouton `Écouter cet extrait` ou `Lire à partir d'ici`.
2. **Auto-Scroll Intelligent** :
   - Dès qu'un paragraphe commence à être lu, appel à `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
   - Si l'utilisateur scrolle manuellement, un flag `userScrolledAway` désactive temporairement le recentrage et affiche une puce flottante *"Reprendre le suivi audio"*.
3. **Mini-Barre de Contrôle Flottante** :
   - Positionnée en bas à droite ou intégrée dans la barre dockée supérieure (`DockedReaderToolbar`).
   - Affiche le temps restant et un scrubber interactif permettant de sauter à n'importe quel paragraphe.

---

## 4. Spécification Mobile (`apps/mobile` React Native)

### 4.1 Moteur Audio Mobile
- **Moteur local** : Intégration de `expo-speech` (wrapper natif d'`AVSpeechSynthesizer` sur iOS et de `android.speech.tts.TextToSpeech` sur Android).
- **Gestion de session audio** : Activation du mode arrière-plan avec `expo-av` (`Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true })`).
- **Évolution future (Streaming IA)** : Possibilité d'intégrer `react-native-track-player` si nous activons des voix haute fidélité hébergées (ElevenLabs/OpenAI TTS).

### 4.2 UI Mobile & Interactions
1. **Intégration au Menu de Sélection Natif** :
   - Dans [`apps/mobile/src/components/article/selection-popover.tsx`](file:///Users/ephe/Desktop/Qoe.fi/dev/prod/qoe.fi/apps/mobile/src/components/article/selection-popover.tsx), ajout d'une action prioritaire `Écouter à partir d'ici`.
2. **Synchronisation du Texte Natif** :
   - Dans [`apps/mobile/modules/article-text-view/src/ArticleTextView.tsx`](file:///Users/ephe/Desktop/Qoe.fi/dev/prod/qoe.fi/apps/mobile/modules/article-text-view/src/ArticleTextView.tsx) (ou le composant de rendu natif de bloc), surligner avec un halo animé doux (via `react-native-reanimated`) le paragraphe en cours de lecture.
   - `FlashList` / `ScrollView` : appel animé à `scrollToIndex({ index: currentParagraphIndex, animated: true, viewPosition: 0.5 })`.
3. **Mini-Player Mobile Rétractable** :
   - Mini-barre flottante ancrée juste au-dessus de la [`LiquidTabBar`](file:///Users/ephe/Desktop/Qoe.fi/dev/prod/qoe.fi/apps/mobile/src/components/liquid-tab-bar/LiquidTabBar.tsx).
   - Design en verre dépoli (`react-native-liquid-glassmorphism` / `expo-blur`) :
     - Play / Pause / Saut 15s.
     - Glissement vers le haut pour ouvrir la feuille complète de lecture (Scrubber, sélecteur de voix, vitesse).
     - Balayage vers le bas pour fermer le player.

---

## 5. Contrôles Système, Écran Verrouillé & Écouteurs

### 5.1 Web : MediaSession API
```typescript
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: article.title,
    artist: authorName,
    artwork: [{ src: article.imageUrl || '/logo-symbol.png', sizes: '512x512', type: 'image/png' }],
  });

  navigator.mediaSession.setActionHandler('play', resumePlayback);
  navigator.mediaSession.setActionHandler('pause', pausePlayback);
  navigator.mediaSession.setActionHandler('previoustrack', previousParagraph);
  navigator.mediaSession.setActionHandler('nexttrack', nextParagraph);
  navigator.mediaSession.setActionHandler('seekbackward', () => skipSeconds(-15));
  navigator.mediaSession.setActionHandler('seekforward', () => skipSeconds(15));
}
```

### 5.2 Mobile : iOS Now Playing & Android Media Notification
- Maintien de l'audio actif écran éteint (`UIBackgroundModes: ["audio"]` dans `app.json`).
- Affichage de la jaquette d'article, du nom de l'auteur et des commandes de saut dans le centre de contrôle iOS et sur l'Apple Watch.
- Support natif des commandes tactiles sur AirPods et écouteurs Bluetooth (simple clic = pause, double clic = paragraphe suivant).

---

## 6. Plan de Déploiement & Étapes d'Implémentation

| Phase | Plateforme | Livrable |
|---|---|---|
| **Phase 1** | Web | Découpage par paragraphe, click-to-listen par paragraphe & MediaSession API dans `@qoe/ui/reader`. |
| **Phase 2** | Web | Karaoké visuel mot-à-mot (`onboundary`), auto-scroll fluide et scrubber interactif de progression. |
| **Phase 3** | Mobile | Ajout d'`expo-speech` et configuration du mode audio background dans `apps/mobile/app.json`. |
| **Phase 4** | Mobile | Mini-player flottant tactile au-dessus de `LiquidTabBar` et bouton « Écouter à partir d'ici » dans `selection-popover.tsx`. |
| **Phase 5** | Mobile | Synchronisation de défilement `react-native-reanimated` dans `ArticleTextView` et intégration Now Playing iOS / MediaStyle Android. |
