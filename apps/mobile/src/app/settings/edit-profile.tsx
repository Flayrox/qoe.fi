// =====================================================================
// ✏️ Route /settings/edit-profile — Édition du profil lecteur
// =====================================================================
// Parité EditProfileModal web : nom, username, bio (heroText),
// localisation (onboardingText), pronoms, avatar (logoUrl, upload),
// bannière (headerImageUrl, upload). Écrit via PATCH /v1/me/profile +
// PATCH /v1/settings/profile (publication personnelle) — contract Go.
// =====================================================================

import { userKeys, feedKeys } from '@qoe/sdk/mobile';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CustomSubHeader } from '@/components/header/CustomSubHeader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Toast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { playHaptic } from '@/lib/haptics';
import { uploadProfileImage } from '@/lib/upload';

export default function EditProfileRoute() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { updateCurrentAccountMeta } = useAuth();
  const { data: me } = useMe();

  // Champs édition.
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);

  // heroText/headerImageUrl vivent sur la publication : chargés depuis le profil public.
  const handle = me?.username || me?.publicationId || '';
  const { data: publicProfile } = useQuery({
    queryKey: userKeys.profile(handle || 'me'),
    queryFn: async () => {
      const res = await apiClient.getUserProfile(handle);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!handle,
    staleTime: 60_000,
  });

  // Hydrate une seule fois quand les données arrivent.
  useEffect(() => {
    if (hydrated || !me) return;
    setName(me.name ?? '');
    setUsername(me.username ?? '');
    setLocation(me.onboardingText ?? '');
    setLogoUrl(me.logoUrl ?? null);
    setHydrated(true);
  }, [me, hydrated]);

  useEffect(() => {
    if (!publicProfile) return;
    setBio(publicProfile.heroText ?? '');
    setHeaderImageUrl(publicProfile.headerImageUrl ?? null);
    setPronouns(publicProfile.pronouns ?? '');
  }, [publicProfile]);

  const pickImage = async (kind: 'avatar' | 'banner') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'avatar' ? [1, 1] : [21, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0] || !me?.id) return;

    setUploading(kind);
    try {
      const asset = result.assets[0];
      const url = await uploadProfileImage(
        {
          uri: asset.uri,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          width: asset.width,
          height: asset.height,
        },
        kind === 'avatar' ? 'avatars' : 'banners',
        me.id
      );
      if (kind === 'avatar') setLogoUrl(url);
      else setHeaderImageUrl(url);
      playHaptic('Success');
    } catch (err) {
      playHaptic('Heavy');
      Toast.show(
        err instanceof Error
          ? err.message
          : t('profile.edit_error', "Échec de l'upload de l'image"),
        'error'
      );
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      Toast.show(t('profile.edit_name_required', 'Le nom est requis'), 'error');
      return;
    }
    setSaving(true);
    try {
      // Profil lecteur : PATCH /v1/me/profile (champs ignorés si identiques/vides).
      const profileRes = await apiClient.updateMyProfile({
        name: name.trim(),
        username: username.trim().toLowerCase().replace(/^@/, ''),
        onboardingText: location.trim(),
        logoUrl: logoUrl ?? undefined,
        pronouns: pronouns.trim(),
      });
      if (!profileRes.ok) throw new Error(profileRes.error);

      // Publication personnelle : PATCH /v1/settings/profile (bio + bannière).
      if (me?.publicationId) {
        const pubRes = await apiClient.updatePublicationProfile(me.publicationId, {
          heroText: bio.trim(),
          headerImageUrl: headerImageUrl ?? null,
        });
        if (!pubRes.ok) throw new Error(pubRes.error);
      }

      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: feedKeys.all });
      updateCurrentAccountMeta({
        name: name.trim(),
        username: username.trim(),
        avatarUrl: logoUrl,
      });

      playHaptic('Success');
      Toast.show(t('profile.edit_saved', 'Profil mis à jour'), 'success');
      router.back();
    } catch (err) {
      playHaptic('Heavy');
      Toast.show(
        err instanceof Error
          ? err.message
          : t('profile.edit_error', 'Erreur lors de la mise à jour'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
  ];

  return (
    <ThemedView style={styles.container}>
      <CustomSubHeader
        title={t('settings.edit_profile', 'Modifier le profil')}
        rightComponent={
          <Pressable
            onPress={() => void save()}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: pressed ? theme.backgroundSelected : theme.primary,
                opacity: saving ? 0.5 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <ThemedText style={styles.saveBtnText}>{t('common.save', 'Enregistrer')}</ThemedText>
            )}
          </Pressable>
        }
      />

      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: 115 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ─── Bannière ─── */}
          <Pressable onPress={() => void pickImage('banner')} style={styles.bannerWrap}>
            {headerImageUrl ? (
              <Image source={{ uri: headerImageUrl }} style={styles.banner} contentFit="cover" />
            ) : (
              <View
                style={[
                  styles.banner,
                  styles.bannerEmpty,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              />
            )}
            <View style={[styles.bannerOverlay, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
              {uploading === 'banner' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText style={styles.overlayText}>
                  {t('profile.edit_banner', 'Changer la bannière')}
                </ThemedText>
              )}
            </View>
          </Pressable>

          {/* ─── Avatar ─── */}
          <View style={styles.avatarRow}>
            <Pressable onPress={() => void pickImage('avatar')} style={styles.avatarWrap}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    styles.avatarEmpty,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                />
              )}
              <View style={[styles.avatarBadge, { backgroundColor: theme.primary }]}>
                {uploading === 'avatar' ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <ThemedText style={styles.avatarBadgeText}>📷</ThemedText>
                )}
              </View>
            </Pressable>
          </View>

          {/* ─── Champs ─── */}
          <View style={styles.form}>
            <View style={styles.field}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('profile.edit_name', 'Nom complet')}
              </ThemedText>
              <TextInput
                style={inputStyle}
                value={name}
                onChangeText={setName}
                placeholder={t('profile.edit_name_placeholder', 'Votre nom')}
                placeholderTextColor={theme.textSecondary}
                autoComplete="name"
                textContentType="name"
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('profile.edit_username', "Nom d'utilisateur")}
              </ThemedText>
              <TextInput
                style={inputStyle}
                value={username}
                onChangeText={setUsername}
                placeholder="@vous"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t(
                  'profile.edit_username_hint',
                  '3 à 24 caractères : minuscules, chiffres, _ ou .'
                )}
              </ThemedText>
            </View>

            <View style={styles.field}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('profile.edit_bio', 'Bio / Présentation')}
              </ThemedText>
              <TextInput
                style={[inputStyle, styles.textarea]}
                value={bio}
                onChangeText={setBio}
                placeholder={t('profile.edit_bio_placeholder', 'Décrivez-vous en quelques mots…')}
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('profile.edit_location', 'Localisation / Ville')}
              </ThemedText>
              <TextInput
                style={inputStyle}
                value={location}
                onChangeText={setLocation}
                placeholder={t('profile.edit_location_placeholder', 'Paris, France')}
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('profile.edit_pronouns', 'Pronoms')}
              </ThemedText>
              <TextInput
                style={inputStyle}
                value={pronouns}
                onChangeText={setPronouns}
                placeholder="il/elle · they/them …"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    paddingBottom: Spacing.six,
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  saveBtn: {
    width: 88,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  bannerWrap: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  banner: {
    width: '100%',
    height: 150,
  },
  bannerEmpty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(150,150,150,0.25)',
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 6,
  },
  avatarRow: {
    alignItems: 'center',
    marginTop: -44,
  },
  avatarWrap: {
    borderRadius: 99,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarEmpty: {
    backgroundColor: 'rgba(150,150,150,0.2)',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarBadgeText: {
    fontSize: 13,
  },
  form: {
    gap: Spacing.three,
  },
  field: {
    gap: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 13,
    fontSize: 15,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
