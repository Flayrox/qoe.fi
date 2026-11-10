import { describe, it, expect } from 'vitest';
import type { TemplatePublisherContext } from '../schema';
import { ARCHETYPES_REGISTRY } from '../defaults';

describe('siteOptions — Contrat AST et intégrité des options', () => {
  it('accepte un dictionnaire siteOptions complet dans TemplatePublisherContext', () => {
    const publisher: TemplatePublisherContext = {
      name: 'Test Publisher',
      siteOptions: {
        showBanner: true,
        showLogo: false,
        showTagline: true,
        showSubscribeButton: false,
        showSocialLinks: true,
        showCraftIndex: true,
        showProgressiveBlur: false,
        showNewsletterWall: false,
      },
    };

    expect(publisher.siteOptions?.showBanner).toBe(true);
    expect(publisher.siteOptions?.showLogo).toBe(false);
    expect(publisher.siteOptions?.showCraftIndex).toBe(true);
    expect(publisher.siteOptions?.showProgressiveBlur).toBe(false);
    expect(publisher.siteOptions?.showNewsletterWall).toBe(false);
  });

  it('gère gracieusement siteOptions absent ou null sans crash', () => {
    const pubWithoutOptions: TemplatePublisherContext = {
      name: 'Publisher sans options',
      siteOptions: null,
    };

    const siteOptions = pubWithoutOptions.siteOptions ?? {};
    const showCraftIndex = (siteOptions.showCraftIndex ?? true) !== false;
    const showProgressiveBlur = (siteOptions.showProgressiveBlur ?? true) !== false;
    const showBanner = (siteOptions.showBanner ?? true) !== false;

    expect(showCraftIndex).toBe(true);
    expect(showProgressiveBlur).toBe(true);
    expect(showBanner).toBe(true);
  });

  it('permet de désactiver sélectivement le sommaire Craft ou les flous progressifs', () => {
    const pubMinimalNoBlur: TemplatePublisherContext = {
      name: 'Journal Minimal',
      siteOptions: {
        showCraftIndex: true,
        showProgressiveBlur: false,
      },
    };

    const isMinimal = ARCHETYPES_REGISTRY.minimal.archetype === 'minimal';
    const siteOptions = pubMinimalNoBlur.siteOptions ?? {};

    const showCraftIndex = (siteOptions.showCraftIndex ?? true) !== false && isMinimal;
    const showProgressiveBlur = (siteOptions.showProgressiveBlur ?? true) !== false && isMinimal;

    expect(showCraftIndex).toBe(true);
    expect(showProgressiveBlur).toBe(false);
  });
});
