import { getSystemConfigs } from '@/lib/admin-data';
import { FrontendCMS } from './components/FrontendCMS';

export default async function AdminFrontend() {
  // Config keys we want to manage in the Frontend CMS
  const targetKeys = [
    'GLOBAL_BANNER_ENABLED',
    'GLOBAL_BANNER_TEXT',
    'GLOBAL_BANNER_LINK',
    // Hero keys
    'hero_editor_title_fr',
    'hero_editor_title_en',
    'hero_editor_body_fr',
    'hero_editor_body_en',
    'hero_reader_items_fr',
    'hero_reader_items_en',
    // Featured keys
    'featured_title_fr',
    'featured_title_en',
    'featured_tagline_fr',
    'featured_tagline_en',
    'featured_background_words',
    // Creator Hub keys
    'creator_hub_title_fr',
    'creator_hub_title_en',
    'creator_hub_tagline_fr',
    'creator_hub_tagline_en',
    'creator_hub_conviction_fr',
    'creator_hub_conviction_en',
    'creator_hub_conviction_sub_fr',
    'creator_hub_conviction_sub_en',
    'creator_hub_manifesto_fr',
    'creator_hub_manifesto_en',
    'creator_hub_tabs_fr',
    'creator_hub_tabs_en',
    // CTA keys
    'cta_eyebrow_fr',
    'cta_eyebrow_en',
    'cta_headline_fr',
    'cta_headline_en',
    'cta_subline_fr',
    'cta_subline_en',
    'cta_btn_primary_fr',
    'cta_btn_primary_en',
    'cta_btn_secondary_fr',
    'cta_btn_secondary_en',
    'cta_social_proof_fr',
    'cta_social_proof_en',
    // Footer keys
    'footer_copyright',
    'footer_sections_fr',
    'footer_sections_en',
    // Onboarding keys
    'ONBOARDING_INTERESTS',
  ];

  // Fetch configs matching keys (Go en primaire, fallback Prisma dev)
  const configs = await getSystemConfigs(targetKeys);

  // Create lookup dictionary
  const configMap: Record<string, string> = {};
  targetKeys.forEach((k) => {
    configMap[k] = configs.find((c) => c.key === k)?.value || '';
  });

  return (
    <div className="w-full space-y-10">
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          CMS Landing Page & Footer
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Pilotez l'intégralité du contenu public et du footer de qoe.fi.
        </p>
      </div>

      <FrontendCMS initialConfigs={configMap} />
    </div>
  );
}
