// =====================================================================
// index.ts — Point d'Entrée du Moteur de Templates Modulaire
// =====================================================================
// Expose l'intégralité du contrat AST, des archétypes, du parser et du
// moteur de rendu polymorphe pour consommation par :
// - apps/studio (@qoe/ui/templates)
// - apps/tenants (@qoe/ui/templates)
// =====================================================================

export * from './schema';
export * from './defaults';
export * from './parser';
export * from './style';
export * from './demo';
export * from './TemplateRenderer';
export * from './blocks/NavbarBlock';
export * from './blocks/HeroBlock';
export * from './blocks/LeadStoryBlock';
export * from './blocks/BentoGridBlock';
export * from './blocks/ArticleStreamBlock';
export * from './blocks/NewsletterWallBlock';
export * from './blocks/FooterBlock';
export * from './blocks/ArticleContentBlock';
export * from './blocks/CategorySpotlightBlock';
export * from './blocks/BlockWrapper';
export * from './blocks/EditableText';
export * from './blocks/NodeRenderer';
export * from './blocks/PublicationSidebar';
export * from './blocks/ArticleEngagementBar';
export * from './archetypes/minimal';
export * from './registry';
export * from './placeholders';
