// =====================================================================
// 📳 haptics.ts — Retour haptique cross-platform (port de #/lib/haptics)
// =====================================================================
// Bluesky joue des haptics « Light » sur chaque action de post (like,
// repost…) et « Heavy » sur les longs press. Ici, en l'absence
// d'expo-haptics, on s'appuie sur `Vibration` de React Native (Android)
// et on no-op sur iOS (pas d'API vibrate fine sans lib native).
// =====================================================================

import { Platform, Vibration } from 'react-native';

export type HapticKind = 'Light' | 'Heavy' | 'Success';

/** Joue un haptic si disponible. No-op silencieux sinon. */
export function playHaptic(kind: HapticKind = 'Light'): void {
  if (Platform.OS === 'android') {
    Vibration.vibrate(kind === 'Light' ? 12 : 30);
  }
  // iOS : nécessite expo-haptics/UIImpactFeedbackGenerator — laissé volontairement
  // en no-op pour ne pas casser la build. Ajouter expo-haptics pour l'activer.
}
