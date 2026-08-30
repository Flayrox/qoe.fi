import { t } from '@lingui/core/macro';

export type SettingsNode = {
  id: string;
  titleKey: string;
  label: () => string;
  path?: string;
  hash?: string;
  keywordsKey?: string[];
  children?: SettingsNode[];
};

export type SearchableSetting = {
  id: string;
  titleKey: string;
  label: () => string;
  keywordsKey: string[];
  path: string;
  breadcrumbs: string[];
  breadcrumbLabels: string[];
};

export const settingsTree: SettingsNode = {
  id: 'settings',
  titleKey: 'sidebar.nav_settings',
  label: () => t`Paramètres`,
  path: '/settings',
  children: [
    {
      id: 'profile-public',
      titleKey: 'dashboard.settings.profile_public',
      label: () => t`Profil public`,
      path: '#profile-public',
      children: [
        {
          id: 'profile-public-edit',
          titleKey: 'dashboard.settings.profile_public_edit',
          label: () => t`Modifier mon profil`,
          hash: '#profile-public-edit',
          keywordsKey: ['profil', 'username', 'avatar', 'bio', 'pronoms', 'nom'],
        },
      ],
    },
    {
      id: 'account',
      titleKey: 'dashboard.settings.account_title',
      label: () => t`Compte`,
      path: '#account',
      children: [
        {
          id: 'account-identity',
          titleKey: 'dashboard.settings.account_identity',
          label: () => t`Identité & email`,
          hash: '#account-identity',
          keywordsKey: ['compte', 'email', 'identité', 'verification'],
        },
        {
          id: 'account-password',
          titleKey: 'dashboard.settings.account_password',
          label: () => t`Mot de passe`,
          hash: '#account-password',
          keywordsKey: ['password', 'mot de passe', 'connexion'],
        },
        {
          id: 'account-providers',
          titleKey: 'dashboard.settings.account_providers',
          label: () => t`Fournisseurs de connexion`,
          hash: '#account-providers',
          keywordsKey: ['oauth', 'google', 'apple', 'connexion'],
        },
      ],
    },
    {
      id: 'security',
      titleKey: 'dashboard.settings.security_title',
      label: () => t`Sécurité`,
      path: '#security',
      children: [
        {
          id: 'security-mfa',
          titleKey: 'dashboard.settings.security_mfa',
          label: () => t`Authentification multifacteur`,
          hash: '#security-mfa',
          keywordsKey: ['mfa', '2fa', 'totp', 'sécurité'],
        },
        {
          id: 'security-sessions',
          titleKey: 'dashboard.settings.security_sessions',
          label: () => t`Sessions actives`,
          hash: '#security-sessions',
          keywordsKey: ['sessions', 'appareils', 'déconnexion'],
        },
        {
          id: 'security-audit',
          titleKey: 'dashboard.settings.security_audit',
          label: () => t`Historique de sécurité`,
          hash: '#security-audit',
          keywordsKey: ['audit', 'connexion', 'historique', 'sécurité'],
        },
      ],
    },
    {
      id: 'privacy',
      titleKey: 'dashboard.settings.privacy_title',
      label: () => t`Confidentialité`,
      path: '#privacy',
      children: [
        {
          id: 'privacy-controls',
          titleKey: 'dashboard.settings.privacy_controls',
          label: () => t`Contrôles de confidentialité`,
          hash: '#privacy-controls',
          keywordsKey: ['confidentialité', 'mentions', 'profil', 'contenu sensible'],
        },
      ],
    },
    {
      id: 'data',
      titleKey: 'dashboard.settings.data_title',
      label: () => t`Données & confidentialité`,
      path: '#data',
      children: [
        {
          id: 'data-export',
          titleKey: 'dashboard.settings.data_export',
          label: () => t`Exporter mes données`,
          hash: '#data-export',
          keywordsKey: ['export', 'données', 'rgpd', 'gdpr'],
        },
        {
          id: 'data-delete',
          titleKey: 'dashboard.settings.data_delete',
          label: () => t`Supprimer mon compte`,
          hash: '#data-delete',
          keywordsKey: ['suppression', 'delete', 'compte', 'rgpd'],
        },
      ],
    },
    {
      id: 'general',
      titleKey: 'dashboard.settings.general_title',
      label: () => t`Général`,
      path: '#general',
      children: [
        {
          id: 'profile-name',
          titleKey: 'dashboard.settings.profile_name',
          label: () => t`Nom de la publication`,
          hash: '#name',
          keywordsKey: ['nom', 'pseudo', 'name', 'username', 'titre'],
        },
        {
          id: 'profile-hero',
          titleKey: 'dashboard.settings.profile_hero',
          label: () => t`Slogan & Présentation`,
          hash: '#hero',
          keywordsKey: ['bio', 'description', 'hero', 'pitch', 'slogan'],
        },
        {
          id: 'profile-brand',
          titleKey: 'dashboard.settings.profile_brand',
          label: () => t`Couleur d'accentuation & Logos`,
          hash: '#brand',
          keywordsKey: [
            'logo',
            'couleur',
            'color',
            'brand',
            'marque',
            'image',
            'banner',
            'police',
            'typo',
          ],
        },
      ],
    },
    {
      id: 'domain',
      titleKey: 'dashboard.settings.domain_title',
      label: () => t`Domaine & DNS`,
      path: '#domain',
      children: [
        {
          id: 'domain-subdomain',
          titleKey: 'dashboard.settings.domain_subdomain',
          label: () => t`Sous-domaine qoe.fi`,
          hash: '#subdomain',
          keywordsKey: ['sous-domaine', 'subdomain', 'url', 'lien', 'qoe.fi'],
        },
        {
          id: 'domain-custom',
          titleKey: 'dashboard.settings.domain_custom',
          label: () => t`Domaine personnalisé`,
          hash: '#custom',
          keywordsKey: ['domaine personnalisé', 'custom domain', 'www', 'site', 'cname', 'dns'],
        },
      ],
    },
    {
      id: 'navigation',
      titleKey: 'dashboard.settings.navigation_title',
      label: () => t`Navigation & Réseaux`,
      path: '#navigation',
      children: [
        {
          id: 'navigation-links',
          titleKey: 'dashboard.settings.navigation_links',
          label: () => t`Menu de navigation principal`,
          hash: '#links',
          keywordsKey: ['menu', 'liens', 'links', 'navigation', 'header', 'onglets'],
        },
        {
          id: 'navigation-social',
          titleKey: 'dashboard.settings.navigation_social',
          label: () => t`Réseaux sociaux`,
          hash: '#social',
          keywordsKey: ['reseaux', 'social', 'twitter', 'instagram', 'linkedin', 'github', 'x'],
        },
      ],
    },
    {
      id: 'seo',
      titleKey: 'dashboard.settings.seo_title',
      label: () => t`SEO & Pied de page`,
      path: '#seo',
      children: [
        {
          id: 'seo-meta',
          titleKey: 'dashboard.settings.seo_meta',
          label: () => t`Balises META (Titre & Description)`,
          hash: '#meta',
          keywordsKey: ['seo', 'meta', 'titre', 'description', 'google', 'recherche'],
        },
        {
          id: 'seo-indexing',
          titleKey: 'dashboard.settings.seo_indexing',
          label: () => t`Indexation moteurs de recherche`,
          hash: '#indexing',
          keywordsKey: ['indexation', 'indexing', 'robots', 'moteurs', 'referencement'],
        },
      ],
    },
  ],
};

export function flattenSettingsTree(
  node: SettingsNode,
  currentPath = '',
  currentBreadcrumbs: string[] = [],
  currentBreadcrumbLabels: string[] = []
): SearchableSetting[] {
  const results: SearchableSetting[] = [];

  const fullPath = node.path?.startsWith('#')
    ? `/settings${node.path}`
    : `${currentPath}${node.path || ''}${node.hash || ''}`;

  const newBreadcrumbs = [...currentBreadcrumbs, node.titleKey];
  const newBreadcrumbLabels = [...currentBreadcrumbLabels, node.label()];

  if (node.keywordsKey) {
    results.push({
      id: node.id,
      titleKey: node.titleKey,
      label: node.label,
      keywordsKey: node.keywordsKey,
      path: fullPath,
      breadcrumbs: currentBreadcrumbs,
      breadcrumbLabels: currentBreadcrumbLabels,
    });
  }

  if (node.children) {
    node.children.forEach((child) => {
      let childBase = currentPath;
      if (node.path && !node.path.startsWith('#')) {
        childBase = `${currentPath}${node.path}`;
      }

      results.push(...flattenSettingsTree(child, childBase, newBreadcrumbs, newBreadcrumbLabels));
    });
  }

  return results;
}
