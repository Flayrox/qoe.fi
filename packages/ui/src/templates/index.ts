// =====================================================================
// 📦 index.ts — Point d'Entrée du Moteur de Templates Modulaire
// =====================================================================
// Expose l'intégralité du contrat AST, des archétypes, du parser et du
// moteur de rendu polymorphe pour consommation par :
// - apps/studio (@qoe/ui/templates)
// - apps/tenants (@qoe/ui/templates)
// =====================================================================

export * from './schema';
export * from './defaults';
export * from './parser';
export * from './TemplateRenderer';
export * from './blocks/NavbarBlock';
export * from './blocks/HeroBlock';
export * from './blocks/LeadStoryBlock';
export * from './blocks/BentoGridBlock';
export * from './blocks/ArticleStreamBlock';
export * from './blocks/NewsletterWallBlock';
export * from './blocks/FooterBlock';
export * from './blocks/BlockWrapper';
