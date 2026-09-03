// =====================================================================
// 📳 haptics.ts — Retour haptique cross-platform (port de #/lib/haptics)
// =====================================================================
// expo-haptics (déjà une dépendance du projet) sur iOS : impacts légers /
// moyens / forts + notification de succès. Android : `Vibration` de RN
// (pas d'API fine sans lib native). No-op silencieux si indisponible.
// =====================================================================

import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export type HapticKind = 'Light' | 'Medium' | 'Heavy' | 'Success';

/** Joue un haptic si disponible. No-op silencieux sinon. */
export function playHaptic(kind: HapticKind = 'Light'): void {
  if (Platform.OS === 'ios') {
    switch (kind) {
      case 'Light':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'Medium':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'Heavy':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'Success':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
    }
    return;
  }
  if (Platform.OS === 'android') {
    const ms = kind === 'Light' ? 12 : kind === 'Medium' ? 20 : 30;
    Vibration.vibrate(ms);
  }
  // Web : rien (pas d'API vibrate fiable hors natif).
}
