import * as Device from 'expo-device';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { ApiStatus } from '@/features/home/api-status';
import { t } from '@/lib/i18n';

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

export default function HomeScreen() {
  const { signOut } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            {t('home.welcome', 'Welcome to Expo')}
          </ThemedText>
        </ThemedView>

        <ThemedText type="code" style={styles.code}>
          {t('home.get_started', 'get started')}
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <HintRow
            title={t('home.try_editing', 'Try editing')}
            hint={<ThemedText type="code">src/app/index.tsx</ThemedText>}
          />
          <HintRow title={t('home.dev_tools', 'Dev tools')} hint={getDevMenuHint()} />
          <HintRow
            title={t('home.fresh_start', 'Fresh start')}
            hint={<ThemedText type="code">npm run reset-project</ThemedText>}
          />
        </ThemedView>

        <ApiStatus />

        <Pressable
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.signOut, { opacity: pressed ? 0.5 : 1 }]}
        >
          <ThemedText type="small">{t('auth.sign_out', 'Se déconnecter')}</ThemedText>
        </Pressable>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  signOut: {
    paddingVertical: Spacing.two,
  },
});
