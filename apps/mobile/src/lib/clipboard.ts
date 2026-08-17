// =====================================================================
// 📋 clipboard.ts — Copie de texte cross-platform
// =====================================================================
// React Native ≥ 0.71 n'expose plus `Clipboard`. En l'absence
// d'expo-clipboard/@react-native-clipboard/clipboard, on copie via :
//   - web : navigator.clipboard.writeText
//   - natif : fallback sur la feuille de partage système (Share) — l'OS
//     propose alors « Copier ».
// Retourne `true` si la copie a réussi (web), `false` si partagée (natif).
// =====================================================================

import { Platform, Share } from 'react-native';

export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallthrough vers le share
    }
  }
  try {
    await Share.share({ message: text });
    return false;
  } catch {
    // Utilisateur a annulé.
    return false;
  }
}
