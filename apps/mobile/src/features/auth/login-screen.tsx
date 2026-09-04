import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

type Mode = 'signin' | 'signup';

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const theme = useTheme();

  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(__DEV__ ? 'dev@qoe.fi' : '');
  const [password, setPassword] = useState(__DEV__ ? 'password123' : '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit() {
    if (!email.trim() || !password || (isSignup && !fullName.trim())) {
      setError(t('login.error_missing_fields', 'Veuillez remplir tous les champs'));
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = isSignup
      ? await signUp(email.trim(), password, fullName.trim())
      : await signIn(email.trim(), password);

    if (result.error) {
      setError(result.error);
    } else if (result.needsConfirmation) {
      setNotice(
        t(
          'login.confirm_email',
          'Un email de confirmation vous a été envoyé. Vérifiez votre boîte mail.'
        )
      );
    }
    setSubmitting(false);
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.backgroundElement,
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.safeArea}
        >
          <ThemedView style={styles.header}>
            <ThemedText type="title">
              {isSignup
                ? t('login.title_signup', 'Créer un compte')
                : t('login.title_login', 'Connexion')}
            </ThemedText>
            <ThemedText type="small" style={styles.subtitle}>
              {isSignup
                ? t('login.subtitle_signup', 'Rejoignez la souveraineté des médias')
                : t('login.subtitle_login', 'Accédez à votre espace souverain')}
            </ThemedText>
          </ThemedView>

          <ThemedView type="card" style={styles.form}>
            {isSignup ? (
              <>
                <ThemedText type="small">{t('login.label_name', 'Nom complet')}</ThemedText>
                <TextInput
                  style={inputStyle}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={t('login.placeholder_name', 'Jean Dupont')}
                  placeholderTextColor={theme.textSecondary}
                  autoComplete="name"
                  textContentType="name"
                />
              </>
            ) : null}

            <ThemedText type="small">{t('login.label_email', 'Adresse email')}</ThemedText>
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={setEmail}
              placeholder={t('login.placeholder_email', 'vous@exemple.fr')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />

            <ThemedText type="small">{t('login.label_password', 'Mot de passe')}</ThemedText>
            <TextInput
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
              placeholder={t('login.placeholder_password', '••••••••')}
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoComplete={isSignup ? 'new-password' : 'password'}
              textContentType={isSignup ? 'newPassword' : 'password'}
              onSubmitEditing={handleSubmit}
            />

            {error ? (
              <ThemedText type="small" style={{ color: theme.destructive }}>
                {error}
              </ThemedText>
            ) : null}
            {notice ? (
              <ThemedText type="small" style={{ color: theme.success }}>
                {notice}
              </ThemedText>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <ThemedText>
                  {isSignup
                    ? t('login.button_signup', "S'inscrire")
                    : t('login.button_login', 'Se connecter')}
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={() => switchMode(isSignup ? 'signin' : 'signup')}
              style={({ pressed }) => [styles.switch, { opacity: pressed ? 0.5 : 1 }]}
            >
              <ThemedText type="small">
                {isSignup
                  ? t('login.switch_login', 'Déjà un compte ? Se connecter')
                  : t('login.switch_signup', "Pas encore de compte ? S'inscrire")}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  subtitle: {
    textAlign: 'center',
  },
  form: {
    gap: Spacing.two,
    borderRadius: Spacing.four,
    padding: Spacing.four,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  switch: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
