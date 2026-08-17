import { router, useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/features/profile/profile-screen';

// =====================================================================
// 👤 Route /user/[username] — Profil public d'un utilisateur.
// Poussée depuis une carte pensée (tap sur l'avatar) ou la recherche.
// =====================================================================
export default function UserRoute() {
  const { username } = useLocalSearchParams<{ username: string }>();
  if (!username) return null;
  return <ProfileScreen username={username} onNavigateBack={() => router.back()} />;
}
