export type SettingsNode = {
  id: string;
  titleKey: string;
  label: string;
  path?: string;
  hash?: string;
  keywordsKey?: string[];
  children?: SettingsNode[];
};

export type SearchableSetting = {
  id: string;
  titleKey: string;
  label: string;
  keywordsKey: string[];
  path: string;
  breadcrumbs: string[];
  breadcrumbLabels: string[];
};

export const settingsTree: SettingsNode = {
  id: "settings",
  titleKey: "sidebar.nav_settings",
  label: "Paramètres",
  path: "/settings",
  children: [
    {
      id: "general",
      titleKey: "dashboard.settings.general_title",
      label: "Général",
      path: "#general",
      children: [
        {
          id: "profile-name",
          titleKey: "dashboard.settings.profile_name",
          label: "Nom de la publication",
          hash: "#name",
          keywordsKey: ["nom", "pseudo", "name", "username", "titre"],
        },
        {
          id: "profile-hero",
          titleKey: "dashboard.settings.profile_hero",
          label: "Slogan & Présentation",
          hash: "#hero",
          keywordsKey: ["bio", "description", "hero", "pitch", "slogan"],
        },
        {
          id: "profile-brand",
          titleKey: "dashboard.settings.profile_brand",
          label: "Couleur d'accentuation & Logos",
          hash: "#brand",
          keywordsKey: ["logo", "couleur", "color", "brand", "marque", "image", "banner", "police", "typo"],
        },
      ],
    },
    {
      id: "domain",
      titleKey: "dashboard.settings.domain_title",
      label: "Domaine & DNS",
      path: "#domain",
      children: [
        {
          id: "domain-subdomain",
          titleKey: "dashboard.settings.domain_subdomain",
          label: "Sous-domaine qoe.fi",
          hash: "#subdomain",
          keywordsKey: ["sous-domaine", "subdomain", "url", "lien", "qoe.fi"],
        },
        {
          id: "domain-custom",
          titleKey: "dashboard.settings.domain_custom",
          label: "Domaine personnalisé",
          hash: "#custom",
          keywordsKey: ["domaine personnalisé", "custom domain", "www", "site", "cname", "dns"],
        },
      ],
    },
    {
      id: "navigation",
      titleKey: "dashboard.settings.navigation_title",
      label: "Navigation & Réseaux",
      path: "#navigation",
      children: [
        {
          id: "navigation-links",
          titleKey: "dashboard.settings.navigation_links",
          label: "Menu de navigation principal",
          hash: "#links",
          keywordsKey: ["menu", "liens", "links", "navigation", "header", "onglets"],
        },
        {
          id: "navigation-social",
          titleKey: "dashboard.settings.navigation_social",
          label: "Réseaux sociaux",
          hash: "#social",
          keywordsKey: ["reseaux", "social", "twitter", "instagram", "linkedin", "github", "x"],
        },
      ],
    },
    {
      id: "seo",
      titleKey: "dashboard.settings.seo_title",
      label: "SEO & Pied de page",
      path: "#seo",
      children: [
        {
          id: "seo-meta",
          titleKey: "dashboard.settings.seo_meta",
          label: "Balises META (Titre & Description)",
          hash: "#meta",
          keywordsKey: ["seo", "meta", "titre", "description", "google", "recherche"],
        },
        {
          id: "seo-indexing",
          titleKey: "dashboard.settings.seo_indexing",
          label: "Indexation moteurs de recherche",
          hash: "#indexing",
          keywordsKey: ["indexation", "indexing", "robots", "moteurs", "referencement"],
        },
      ],
    },
  ],
};

export function flattenSettingsTree(
  node: SettingsNode,
  currentPath = "",
  currentBreadcrumbs: string[] = [],
  currentBreadcrumbLabels: string[] = []
): SearchableSetting[] {
  const results: SearchableSetting[] = [];

  const fullPath = node.path?.startsWith("#")
    ? `/settings${node.path}`
    : `${currentPath}${node.path || ""}${node.hash || ""}`;

  const newBreadcrumbs = [...currentBreadcrumbs, node.titleKey];
  const newBreadcrumbLabels = [...currentBreadcrumbLabels, node.label];

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
      if (node.path && !node.path.startsWith("#")) {
        childBase = `${currentPath}${node.path}`;
      }

      results.push(
        ...flattenSettingsTree(child, childBase, newBreadcrumbs, newBreadcrumbLabels)
      );
    });
  }

  return results;
}
