import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
  // Connecté : le drawer deck (façon X) entoure les onglets — la sidebar vit
  // en arrière-plan et le feed se décale/rétrécit pour la révéler.
  // Déconnecté : écran de connexion.
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppProviders>
          <AnimatedSplashOverlay />
          <RootContent />
        </AppProviders>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
