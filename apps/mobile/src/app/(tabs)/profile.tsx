import { ProfileScreen } from '@/features/profile/profile-screen';

export default function ProfileTab() {
  // « me » → résolu vers le compte connecté dans ProfileScreen
  return <ProfileScreen username="me" />;
}
