// =====================================================================
// 🔐 Route /settings/security — Sécurité du compte
// =====================================================================
// Parité SecuritySettings web : 2FA TOTP (Supabase GoTrue), fournisseurs
// connectés (lecture), sessions OAuth actives (GET /v1/me/sessions +
// révocation), déconnexion globale de toutes les sessions Supabase.
// =====================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Toast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import {
  SettingsFootnote,
  SettingsRowSeparator,
  SettingsScreenShell,
  SettingsSection,
  SettingsToggleRow,
  SettingsActionRow,
} from '@/features/settings/settings-ui';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { playHaptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

interface Factor {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
}
interface Identity {
  id?: string;
  provider: string;
  identity_data?: { email?: string } | null;
}

export default function SecuritySettingsRoute() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { signOutAll } = useAuth();

  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(
    null
  );
  const [code, setCode] = useState('');

  const loadSecurity = useCallback(async () => {
    const [mfaRes, identityRes] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.getUserIdentities(),
    ]);
    return {
      factors: (mfaRes.data?.all ?? []) as Factor[],
      identities: (identityRes.data?.identities ?? []) as Identity[],
    };
  }, []);

  const { data: security, refetch: refetchSecurity } = useQuery({
    queryKey: ['settings', 'security'],
    queryFn: loadSecurity,
    staleTime: 30_000,
  });

  const { data: sessions } = useQuery({
    queryKey: ['settings', 'sessions'],
    queryFn: async () => {
      const res = await apiClient.getSessions();
      if (!res.ok) throw new Error(res.error);
      return res.data.sessions;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!enrollment) return;
    const timer = setTimeout(() => setCode(''), 60_000);
    return () => clearTimeout(timer);
  }, [enrollment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginEnrollment = async () => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'qoe.fi',
    });
    setBusy(false);
    if (error) {
      setMessage({ type: 'err', text: error.message });
      return;
    }
    if (data?.id && data.totp?.qr_code && data.totp.secret) {
      setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    }
  };

  const verifyEnrollment = async () => {
    if (!enrollment || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setMessage(null);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollment.id,
    });
    if (challengeError || !challenge?.id) {
      setBusy(false);
      setMessage({
        type: 'err',
        text:
          challengeError?.message ??
          t('settings.mfa_challenge_error', 'Impossible de démarrer la vérification.'),
      });
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollment.id,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (verifyError) {
      setMessage({ type: 'err', text: verifyError.message });
      return;
    }
    playHaptic('Success');
    setEnrollment(null);
    setCode('');
    setMessage({
      type: 'ok',
      text: t('settings.mfa_enabled', 'Authentification à deux facteurs activée.'),
    });
    await refetchSecurity();
  };

  const removeFactor = async (factorId: string) => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      setMessage({ type: 'err', text: error.message });
      return;
    }
    playHaptic('Light');
    await refetchSecurity();
  };

  const revokeSessions = async (kind: 'others' | 'all') => {
    setBusy(true);
    setMessage(null);
    const res =
      kind === 'others'
        ? await apiClient.revokeOtherSessions()
        : await apiClient.revokeAllSessions();
    setBusy(false);
    if (!res.ok) {
      setMessage({ type: 'err', text: res.error });
      return;
    }
    playHaptic('Success');
    if (kind === 'all') {
      // révoquer TOUTES les sessions inclut la courante côté Go : on repart propre.
      await signOutAll();
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['settings', 'sessions'] });
    setMessage({
      type: 'ok',
      text: t('settings.sessions_revoked', 'Autres sessions déconnectées.'),
    });
  };

  const verifiedFactors = security?.factors.filter((f) => f.status === 'verified') ?? [];
  const identities = security?.identities ?? [];

  return (
    <SettingsScreenShell
      title={t('settings.security', 'Sécurité')}
      subtitle={t('settings.security_subtitle', 'Protégez votre compte et contrôlez vos accès')}
    >
      {message ? (
        <View
          style={[
            styles.message,
            {
              backgroundColor:
                message.type === 'ok' ? 'rgba(46,160,67,0.1)' : 'rgba(220,38,38,0.1)',
            },
          ]}
        >
          <ThemedText
            type="small"
            style={{ color: message.type === 'ok' ? theme.success : theme.destructive }}
          >
            {message.text}
          </ThemedText>
        </View>
      ) : null}

      <SettingsSection title={t('settings.mfa', 'Authentification à deux facteurs')}>
        {security === undefined ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <View>
            {verifiedFactors.map((factor) => (
              <View key={factor.id}>
                <SettingsToggleRow
                  label={factor.friendly_name || 'TOTP'}
                  description={t('settings.mfa_verified', 'Vérifié')}
                  value
                  onChange={() => void removeFactor(factor.id)}
                />
                {verifiedFactors.length > 1 ? <SettingsRowSeparator /> : null}
              </View>
            ))}
            {!enrollment ? (
              <SettingsActionRow
                label={t('settings.mfa_add', 'Ajouter un facteur TOTP')}
                busy={busy}
                onPress={() => void beginEnrollment()}
              />
            ) : (
              <View style={styles.enrollWrap}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {t(
                    'settings.mfa_scan',
                    'Scannez ce QR code avec votre application d’authentification.'
                  )}
                </ThemedText>
                {/* Le QR est un SVG data-uri : rendu web uniquement; natif → secret affiché.
                    Sur natif, l'utilisateur saisit le secret dans son app TOTP. */}
                {enrollment.qr.startsWith('data:image/svg') ? (
                  <ThemedText
                    type="small"
                    style={[styles.fallbackQr, { color: theme.textSecondary }]}
                  >
                    {t(
                      'settings.mfa_native_hint',
                      'QR code non affichable sur mobile : utilisez le secret ci-dessous.'
                    )}
                  </ThemedText>
                ) : null}
                <View
                  style={[
                    styles.secretBox,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}
                >
                  <ThemedText type="small" style={styles.secretText}>
                    {enrollment.secret}
                  </ThemedText>
                </View>
                <View style={styles.codeRow}>
                  <TextInput
                    style={[
                      styles.codeInput,
                      {
                        color: theme.text,
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                    placeholder="123456"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Pressable
                    onPress={() => void verifyEnrollment()}
                    disabled={busy || code.length !== 6}
                    style={({ pressed }) => [
                      styles.verifyBtn,
                      {
                        backgroundColor: pressed ? theme.backgroundSelected : theme.primary,
                        opacity: busy || code.length !== 6 ? 0.5 : 1,
                      },
                    ]}
                  >
                    <ThemedText style={styles.verifyText}>
                      {t('common.verify', 'Vérifier')}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
            <SettingsFootnote>
              {t(
                'settings.mfa_footnote',
                'GoTrue ne fournit pas encore de codes de récupération. Ajoutez un second facteur TOTP sur un autre appareil comme solution de secours.'
              )}
            </SettingsFootnote>
          </View>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.providers', 'Fournisseurs connectés')}>
        <View style={styles.providersWrap}>
          {identities.length > 0 ? (
            <View style={styles.chips}>
              {identities.map((identity) => (
                <View
                  key={`${identity.provider}-${identity.id}`}
                  style={[
                    styles.chip,
                    { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <ThemedText type="small" style={styles.chipText}>
                    {identity.provider}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {t('settings.providers_empty', 'Aucun fournisseur lié (mot de passe uniquement).')}
            </ThemedText>
          )}
          <SettingsFootnote>
            {t(
              'settings.providers_footnote',
              'Les fournisseurs liés ne donnent jamais accès à vos tokens. La liaison se fait depuis le web.'
            )}
          </SettingsFootnote>
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.sessions', 'Sessions')}>
        <View>
          {sessions && sessions.length > 0 ? (
            <>
              {sessions.map((session, index) => (
                <View key={session.id}>
                  {index > 0 ? <SettingsRowSeparator /> : null}
                  <View style={styles.sessionRow}>
                    <View style={styles.sessionBody}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {session.clientId || t('settings.session_unknown', 'Appareil inconnu')}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {session.current
                          ? t('settings.session_current', 'Cette session')
                          : t('settings.session_created', 'Créée le {date}', {
                              date: new Date(session.createdAt).toLocaleDateString(),
                            })}
                      </ThemedText>
                    </View>
                    {session.current ? (
                      <ThemedText type="smallBold" style={{ color: theme.primary }}>
                        {t('settings.current', 'Actif')}
                      </ThemedText>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setBusy(true);
                          void (async () => {
                            const res = await apiClient.revokeSession(session.id);
                            setBusy(false);
                            if (!res.ok) {
                              Toast.show(res.error, 'error');
                              return;
                            }
                            await queryClient.invalidateQueries({
                              queryKey: ['settings', 'sessions'],
                            });
                          })();
                        }}
                        hitSlop={8}
                        style={({ pressed }) => [styles.revokeBtn, { opacity: pressed ? 0.5 : 1 }]}
                      >
                        <ThemedText type="small" style={{ color: theme.destructive }}>
                          {t('settings.session_revoke', 'Révoquer')}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
              <SettingsRowSeparator />
              <SettingsActionRow
                label={t('settings.sessions_revoke_others', 'Déconnecter les autres appareils')}
                busy={busy}
                onPress={() => void revokeSessions('others')}
              />
            </>
          ) : (
            <View style={styles.center}>
              <ActivityIndicator color={theme.text} />
            </View>
          )}
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.sessions_native', 'Sessions natives Supabase')}>
        <View>
          <SettingsActionRow
            label={t('settings.sign_out_all_devices', 'Déconnecter tous les appareils')}
            destructive
            busy={busy}
            onPress={() => void revokeSessions('all')}
          />
          <SettingsFootnote>
            {t(
              'settings.sign_out_all_devices_desc',
              'Déconnecte tous les appareils gérés par Supabase Auth.'
            )}
          </SettingsFootnote>
        </View>
      </SettingsSection>
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  message: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.four,
  },
  enrollWrap: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  fallbackQr: {
    lineHeight: 17,
  },
  secretBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  secretText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
    flexWrap: 'wrap',
  },
  codeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  codeInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 11,
    fontSize: 16,
    textAlign: 'center',
  },
  verifyBtn: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  providersWrap: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontWeight: '600',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  sessionBody: {
    flex: 1,
    gap: 2,
  },
  revokeBtn: {
    padding: 6,
  },
});
