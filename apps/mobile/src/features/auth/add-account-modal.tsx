import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

export function AddAccountModal({
  visible,
  onClose,
  initialMode = 'signin',
}: AddAccountModalProps) {
  const { signInSecondary, signUp } = useAuth();
  const theme = useTheme();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  function resetForm() {
    setFullName('');
    setEmail('');
    setPassword('');
    setError(null);
    setNotice(null);
  }

  function handleClose() {
    resetForm();
    onClose();
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
      : await signInSecondary(email.trim(), password);

    if (result.error) {
      playHaptic('Heavy');
      setError(result.error);
      setSubmitting(false);
    } else if (result.needsConfirmation) {
      playHaptic('Success');
      setNotice(
        t(
          'login.confirm_email',
          'Un email de confirmation vous a été envoyé. Vérifiez votre boîte mail.'
        )
      );
      setSubmitting(false);
    } else {
      playHaptic('Success');
      setSubmitting(false);
      handleClose();
    }
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.backgroundElement,
      borderColor: theme.border,
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header avec bouton fermer */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleClose}
            hitSlop={8}
            style={({ pressed }) => [
              styles.closeBtn,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}
          >
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={18}
              tintColor={theme.text}
              weight="medium"
            />
          </Pressable>
          <ThemedText style={styles.headerTitle}>
            {isSignup
              ? t('account.create_new', 'Créer un nouveau compte')
              : t('account.add_existing', 'Ajouter un compte existant')}
          </ThemedText>
          <View style={styles.closeBtnPlaceholder} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.body}
        >
          <View style={styles.form}>
            {isSignup ? (
              <View style={styles.field}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {t('login.label_name', 'Nom complet')}
                </ThemedText>
                <TextInput
                  style={inputStyle}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={t('login.placeholder_name', 'Jean Dupont')}
                  placeholderTextColor={theme.textSecondary}
                  autoComplete="name"
                  textContentType="name"
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('login.label_email', 'Adresse email')}
              </ThemedText>
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
            </View>

            <View style={styles.field}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('login.label_password', 'Mot de passe')}
              </ThemedText>
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
            </View>

            {error ? (
              <ThemedText type="small" style={{ color: theme.destructive, marginTop: 4 }}>
                {error}
              </ThemedText>
            ) : null}
            {notice ? (
              <ThemedText type="small" style={{ color: theme.success, marginTop: 4 }}>
                {notice}
              </ThemedText>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: pressed ? theme.backgroundSelected : theme.primary },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText style={styles.submitBtnText}>
                  {isSignup
                    ? t('login.button_signup', "S'inscrire")
                    : t('login.button_login', 'Se connecter')}
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setError(null);
                setNotice(null);
              }}
              style={({ pressed }) => [styles.switchBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: 'center' }}>
                {isSignup
                  ? t('login.switch_login', 'Déjà un compte ? Se connecter')
                  : t('login.switch_signup', "Pas encore de compte ? S'inscrire")}
              </ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPlaceholder: {
    width: 32,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  form: {
    gap: Spacing.three,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  field: {
    gap: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    fontSize: 16,
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: Spacing.two,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  switchBtn: {
    paddingVertical: Spacing.two,
  },
});
