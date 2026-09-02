import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppProviders } from '@/components/providers/app-providers';
import { ThemePreferenceProvider } from '@/context/theme-provider';
import { useAuth } from '@/features/auth/auth-provider';
import { LoginScreen } from '@/features/auth/login-screen';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
      <Stack.Screen name="thought/[id]" />
      <Stack.Screen name="post/[id]/[kind]" />
      <Stack.Screen name="user/[username]" />
      <Stack.Screen name="user/[username]/follow" />
      <Stack.Screen name="article/[slug]" />
      <Stack.Screen name="library" />
      <Stack.Screen name="history" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/account" />
      <Stack.Screen name="settings/accounts" />
      <Stack.Screen name="settings/edit-profile" />
      <Stack.Screen name="settings/notifications" />
      <Stack.Screen name="settings/privacy" />
      <Stack.Screen name="settings/appearance" />
      <Stack.Screen name="settings/language" />
      <Stack.Screen name="settings/data" />
      <Stack.Screen name="settings/security" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePreferenceProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AppProviders>
            <AnimatedSplashOverlay />
            <RootNavigator />
          </AppProviders>
        </ThemeProvider>
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}
