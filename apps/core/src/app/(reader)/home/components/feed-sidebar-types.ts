// Types partagés du foyer (widgets latéraux). Séparés du composant pour que
// `FeedDashboard` n'importe pas un module d'interface jamais rendu.

export interface SuggestedCreator {
  id: string;
  name: string | null;
  username: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl: string | null;
  heroText?: string | null;
  affinityScore?: number;
  recentArticleTitle?: string | null;
}

export interface SemanticTrendingTopic {
  id: string;
  topicName: string;
  description?: string;
  count: number;
  growthRate: string;
}
