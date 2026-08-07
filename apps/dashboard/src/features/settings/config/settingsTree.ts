export type SettingsNode = {
  id: string;
  titleKey: string;
  path?: string;
  hash?: string;
  keywordsKey?: string[];
  children?: SettingsNode[];
};

export type SearchableSetting = {
  id: string;
  titleKey: string;
  keywordsKey: string[];
  path: string;
  breadcrumbs: string[];
};

export const settingsTree: SettingsNode = {
  id: "settings",
  titleKey: "nav_settings",
  path: "/settings",
  children: [
    {
      id: "general",
      titleKey: "settings_general_title",
      path: "#general",
      children: [
        {
          id: "profile-name",
          titleKey: "settings_profile_name",
          hash: "#name",
          keywordsKey: ["nom", "pseudo", "name", "username"],
        },
        {
          id: "profile-hero",
          titleKey: "settings_profile_hero",
          hash: "#hero",
          keywordsKey: ["bio", "description", "hero", "pitch"],
        },
        {
          id: "profile-brand",
          titleKey: "settings_profile_brand",
          hash: "#brand",
          keywordsKey: ["logo", "couleur", "color", "brand", "marque", "image", "banner"],
        },
      ],
    },
    {
      id: "domain",
      titleKey: "settings_domain_title",
      path: "#domain",
      children: [
        {
          id: "domain-subdomain",
          titleKey: "settings_domain_subdomain",
          hash: "#subdomain",
          keywordsKey: ["sous-domaine", "subdomain", "url", "lien", "qoe.fi"],
        },
        {
          id: "domain-custom",
          titleKey: "settings_domain_custom",
          hash: "#custom",
          keywordsKey: ["domaine personnalisé", "custom domain", "www", "site"],
        },
      ],
    },
    {
      id: "navigation",
      titleKey: "settings_navigation_title",
      path: "#navigation",
      children: [
        {
          id: "navigation-links",
          titleKey: "settings_navigation_links",
          hash: "#links",
          keywordsKey: ["menu", "liens", "links", "navigation", "header"],
        },
        {
          id: "navigation-social",
          titleKey: "settings_navigation_social",
          hash: "#social",
          keywordsKey: ["reseaux", "social", "twitter", "instagram", "linkedin", "github"],
        },
      ],
    },
    {
      id: "seo",
      titleKey: "settings_seo_title",
      path: "#seo",
      children: [
        {
          id: "seo-meta",
          titleKey: "settings_seo_meta",
          hash: "#meta",
          keywordsKey: ["seo", "meta", "titre", "description", "google", "recherche"],
        },
        {
          id: "seo-indexing",
          titleKey: "settings_seo_indexing",
          hash: "#indexing",
          keywordsKey: ["indexation", "indexing", "robots", "moteurs"],
        },
      ],
    },
  ],
};

export function flattenSettingsTree(
  node: SettingsNode,
  currentPath = "",
  currentBreadcrumbs: string[] = []
): SearchableSetting[] {
  const results: SearchableSetting[] = [];

  const fullPath = node.path?.startsWith("#")
    ? `/settings${node.path}`
    : `${currentPath}${node.path || ""}${node.hash || ""}`;

  const newBreadcrumbs = [...currentBreadcrumbs, node.titleKey];

  if (node.keywordsKey) {
    results.push({
      id: node.id,
      titleKey: node.titleKey,
      keywordsKey: node.keywordsKey,
      path: fullPath,
      breadcrumbs: currentBreadcrumbs,
    });
  }

  if (node.children) {
    node.children.forEach((child) => {
      let childBase = currentPath;
      if (node.path && !node.path.startsWith("#")) {
        childBase = `${currentPath}${node.path}`;
      }

      results.push(...flattenSettingsTree(child, childBase, newBreadcrumbs));
    });
  }

  return results;
}
