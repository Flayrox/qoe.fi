import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AppDrawer } from '@/components/drawer/app-drawer';
import { AppProviders } from '@/components/providers/app-providers';
import { useAuth } from '@/features/auth/auth-provider';
import { LoginScreen } from '@/features/auth/login-screen';

SplashScreen.preventAutoHideAsync();

// Consommé DANS AppProviders : useAuth a besoin du contexte AuthProvider.
function RootContent() {
  const { session, isLoading } = useAuth();

  // Pendant le chargement de la session, on laisse le splash couvrir l'écran.
  if (isLoading) {
    return null;
  }
  // Connecté : la sidebar (façon Twitter) entoure les onglets et assombrit
  // le contenu quand elle s'ouvre. Déconnecté : écran de connexion.
  return session ? (
    <AppDrawer>
      <AppTabs />
    </AppDrawer>
  ) : (
    <LoginScreen />
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppProviders>
        <AnimatedSplashOverlay />
        <RootContent />
      </AppProviders>
    </ThemeProvider>
  );
}
