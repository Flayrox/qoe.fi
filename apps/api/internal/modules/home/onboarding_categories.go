package home

// Catégories d'onboarding lecteur (port Go de RICH_DEFAULT_TOPICS de
// packages/db/src/onboarding.ts — données statiques côté front).

type OnboardingSubtopic struct {
	ID   string   `json:"id"`
	Name string   `json:"name"`
	Slug string   `json:"slug"`
	Tags []string `json:"tags,omitempty"`
}

type OnboardingCategory struct {
	ID        string               `json:"id"`
	Name      string               `json:"name"`
	Slug      string               `json:"slug"`
	Icon      string               `json:"icon"`
	Subtopics []OnboardingSubtopic `json:"subtopics"`
}

var richDefaultTopics = []OnboardingCategory{
	{
		ID: "tech", Name: "Tech & IA", Slug: "tech", Icon: "Cpu",
		Subtopics: []OnboardingSubtopic{
			{ID: "llm", Name: "Grands Modèles & IA Locale", Slug: "llm", Tags: []string{"ia", "llm", "open-source"}},
			{ID: "opensource", Name: "Open Source & Souveraineté", Slug: "opensource", Tags: []string{"linux", "privacy", "dev"}},
			{ID: "cyber", Name: "Cybersécurité & Chiffrement", Slug: "cyber", Tags: []string{"security", "crypto", "privacy"}},
			{ID: "web3", Name: "Protocoles Décentralisés", Slug: "web3", Tags: []string{"p2p", "fediverse", "nostr"}},
			{ID: "hardware", Name: "Hardware & Semi-conducteurs", Slug: "hardware", Tags: []string{"chips", "robotique"}},
		},
	},
	{
		ID: "economy", Name: "Économie & Finance", Slug: "economy", Icon: "TrendingUp",
		Subtopics: []OnboardingSubtopic{
			{ID: "macro", Name: "Macroéconomie & Monnaie", Slug: "macro", Tags: []string{"macro", "banques", "inflation"}},
			{ID: "creatorecon", Name: "Creator Economy & Monétisation", Slug: "creatorecon", Tags: []string{"business", "media", "saas"}},
			{ID: "invest", Name: "Investissement Responsable", Slug: "invest", Tags: []string{"bourse", "esg", "capital"}},
			{ID: "startups", Name: "Entrepreneuriat Européen", Slug: "startups", Tags: []string{"startups", "tech", "bootstrapping"}},
		},
	},
	{
		ID: "society", Name: "Société & Géopolitique", Slug: "society", Icon: "Globe2",
		Subtopics: []OnboardingSubtopic{
			{ID: "geopol", Name: "Géopolitique & Europe", Slug: "geopol", Tags: []string{"europe", "diplomatie", "defense"}},
			{ID: "democracy", Name: "Démocratie & Médias Libres", Slug: "democracy", Tags: []string{"presse", "liberte", "politique"}},
			{ID: "climate", Name: "Climat & Transition Énergétique", Slug: "climate", Tags: []string{"energie", "ecologie", "climat"}},
			{ID: "urban", Name: "Urbanisme & Futur du Travail", Slug: "urban", Tags: []string{"remote", "villes", "sociologie"}},
		},
	},
	{
		ID: "culture", Name: "Culture & Création", Slug: "culture", Icon: "Palette",
		Subtopics: []OnboardingSubtopic{
			{ID: "cinema", Name: "Cinéma & Narration", Slug: "cinema", Tags: []string{"cinema", "critique", "series"}},
			{ID: "design", Name: "Design Graphique & Typographie", Slug: "design", Tags: []string{"design", "ui", "typographie"}},
			{ID: "music", Name: "Musique & Sound Design", Slug: "music", Tags: []string{"musique", "production", "audio"}},
			{ID: "literature", Name: "Littérature & Essais", Slug: "literature", Tags: []string{"livres", "essais", "poesie"}},
		},
	},
	{
		ID: "mind", Name: "Philosophie & Esprit", Slug: "mind", Icon: "Compass",
		Subtopics: []OnboardingSubtopic{
			{ID: "stoic", Name: "Stoïcisme & Philosophie Pratique", Slug: "stoic", Tags: []string{"stoicisme", "sagesse", "ethique"}},
			{ID: "cognition", Name: "Attention & Déconnexion", Slug: "cognition", Tags: []string{"focus", "digital-detox", "temps-long"}},
			{ID: "epistemology", Name: "Épistémologie & Esprit Critique", Slug: "epistemology", Tags: []string{"science", "verite", "reflexion"}},
			{ID: "ethics", Name: "Éthique des Technologies", Slug: "ethics", Tags: []string{"ia-ethique", "transhumanisme"}},
		},
	},
	{
		ID: "science", Name: "Sciences & Espace", Slug: "science", Icon: "Sparkles",
		Subtopics: []OnboardingSubtopic{
			{ID: "space", Name: "Astronomie & Espace", Slug: "space", Tags: []string{"astronomie", "spatial", "physique"}},
			{ID: "bio", Name: "Biologie & Longévité", Slug: "bio", Tags: []string{"sante", "longevite", "genetique"}},
			{ID: "quantum", Name: "Physique Quantique", Slug: "quantum", Tags: []string{"physique", "informatique-quantique"}},
		},
	},
}
