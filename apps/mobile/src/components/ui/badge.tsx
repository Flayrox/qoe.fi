// =====================================================================
// 🏅 CertifiedBadge — Croix de certification (port de Bluesky ProfileBadges)
// =====================================================================
// Petit badge inline à côté du nom (post header / profil).
// =====================================================================

import { SymbolView } from 'expo-symbols';

export function CertifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <SymbolView
      name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }}
      size={size}
      tintColor="#0b6bcb"
      weight="regular"
    />
  );
}
