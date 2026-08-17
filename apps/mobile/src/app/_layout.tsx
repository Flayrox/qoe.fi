import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppProviders } from '@/components/providers/app-providers';
import { useAuth } from '@/features/auth/auth-provider';
import { LoginScreen } from '@/features/auth/login-screen';

SplashScreen.preventAutoHideAsync();

// ─────────────────────────────────────────────────────────────────────
// Navigateur racine : un Stack qui contient
//   - `(tabs)`  : le deck (drawer façon X) + les onglets natifs (Feed/Explore)
//   - `thought/[id]`, `user/[username]`, `article/[slug]`, `compose` :
//     écrans poussés par-dessus les onglets (avec header natif).
// Sans session → écran de connexion plein écran.
// ─────────────────────────────────────────────────────────────────────
function RootNavigator() {
  const { session, isLoading } = useAuth();

  // Pendant le chargement de la session, on laisse le splash couvrir l'écran.
  if (isLoading) {
    return null;
  }
  // Déconnecté : écran de connexion.
  if (!session) {
    return <LoginScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="thought/[id]" options={{ headerShown: true, title: 'Pensée' }} />
      <Stack.Screen name="user/[username]" options={{ headerShown: true, title: 'Profil' }} />
      <Stack.Screen name="article/[slug]" options={{ headerShown: true, title: 'Article' }} />
      <Stack.Screen name="library" options={{ headerShown: true, title: 'Bibliothèque' }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications' }} />
      <Stack.Screen
        name="compose"
        options={{ headerShown: true, title: 'Nouvelle pensée', presentation: 'modal' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppProviders>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </AppProviders>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
