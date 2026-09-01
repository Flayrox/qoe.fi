// =====================================================================
// ⚙️ Route /settings — Réglages (parité web apps/core/src/app/(reader)/settings)
// =====================================================================
// Toutes les entrées du compte lecteur vivent ici (les réglages créateur
// arriveront avec le Studio). Sections : Compte, Notifications,
// Confidentialité, Apparence & lecture, Langue, Données & sécurité,
// Sécurité.
// =====================================================================

import { router } from 'expo-router';

import {
  SettingsLinkRow,
  SettingsScreenShell,
  SettingsSection,
} from '@/features/settings/settings-ui';
import { t } from '@/lib/i18n';

export default function SettingsRoute() {
  return (
    <SettingsScreenShell
      title={t('settings.title', 'Réglages')}
      subtitle={t('settings.subtitle', 'Compte, apparence, confidentialité')}
    >
      <SettingsSection title={t('settings.section_account', 'Compte')}>
        <SettingsLinkRow
          icon={{ ios: 'person.crop.circle', android: 'person', web: 'person' }}
          label={t('settings.profile', 'Profil')}
          description={t('settings.profile_desc', 'Nom, bio, photo, bannière, localisation')}
          onPress={() => router.push('/settings/edit-profile')}
        />
        <SettingsLinkRow
          icon={{ ios: 'person.2', android: 'groups', web: 'groups' }}
          label={t('settings.accounts', 'Comptes & sessions')}
          description={t('settings.accounts_desc', 'Basculer, ajouter ou retirer un compte')}
          onPress={() => router.push('/settings/accounts')}
        />
        <SettingsLinkRow
          icon={{ ios: 'info.circle', android: 'info', web: 'info' }}
          label={t('settings.account_info', 'Informations du compte')}
          description={t('settings.account_info_desc', 'Email, rôle, mot de passe, déconnexion')}
          onPress={() => router.push('/settings/account')}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.section_experience', 'Expérience')}>
        <SettingsLinkRow
          icon={{ ios: 'paintpalette', android: 'palette', web: 'palette' }}
          label={t('settings.appearance', 'Apparence & lecture')}
          description={t('settings.appearance_desc', 'Thème clair/sombre, taille du texte')}
          onPress={() => router.push('/settings/appearance')}
        />
        <SettingsLinkRow
          icon={{ ios: 'globe', android: 'language', web: 'language' }}
          label={t('settings.language', 'Langue')}
          description={t('settings.language_desc', 'Français ou English')}
          onPress={() => router.push('/settings/language')}
        />
        <SettingsLinkRow
          icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
          label={t('settings.notifications', 'Notifications')}
          description={t('settings.notifications_desc', 'Emails et notifications d’activité')}
          onPress={() => router.push('/settings/notifications')}
        />
        <SettingsLinkRow
          icon={{ ios: 'hand.raised', android: 'shield', web: 'shield' }}
          label={t('settings.privacy', 'Confidentialité')}
          description={t('settings.privacy_desc', 'Visibilité, mentions, mots masqués')}
          onPress={() => router.push('/settings/privacy')}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.section_danger', 'Données & sécurité')}>
        <SettingsLinkRow
          icon={{ ios: 'lock.shield', android: 'security', web: 'security' }}
          label={t('settings.security', 'Sécurité')}
          description={t('settings.security_desc', '2FA, fournisseurs connectés, sessions')}
          onPress={() => router.push('/settings/security')}
        />
        <SettingsLinkRow
          icon={{ ios: 'arrow.down.doc', android: 'download', web: 'download' }}
          label={t('settings.data', 'Données & suppression')}
          description={t('settings.data_desc', 'Export, suppression du compte')}
          onPress={() => router.push('/settings/data')}
        />
      </SettingsSection>
    </SettingsScreenShell>
  );
}
