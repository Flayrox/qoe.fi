// =====================================================================
// 💌 NewsletterWallBlock.tsx — Mur d'Abonnement & Social Proof (Licorne 2026)
// =====================================================================
// Bloc haute-conversion pour capturer l'audience et fidéliser le lectorat.
// Supporte :
// - Halo lumineux diffus (Radial Accent Glow)
// - Compteur d'abonnés en direct (Social proof)
// - Pastille incitative ("100% Indépendant", "Sans algorithme")
// - Formulaire d'inscription réactif
// =====================================================================

import React from 'react';
import { Mail, Sparkles, Users } from 'lucide-react';
import type {
  NewsletterWallBlockProps,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';

interface NewsletterWallBlockComponentProps {
  id: string;
  props: NewsletterWallBlockProps;
  publication: TemplatePublicationContext;
  cardShape?: CardCornerShape;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
}

export function NewsletterWallBlock({
  id,
  props,
  publication,
  cardShape = 'rounded-3xl',
  context,
  visible = true,
  locked = false,
}: NewsletterWallBlockComponentProps) {
  const {
    title = 'Ne manquez aucune publication',
    subtitle = 'Recevez nos analyses, enquêtes et réflexions directement par email.',
    accentGlow = true,
    showSubscriberCount = true,
    buttonText = "S'abonner",
    incentivePill = 'Édition Indépendante',
  } = props;

  const subscriberCount = publication.subscriberCount || 420;

  return (
    <BlockWrapper
      id={id}
      type="newsletter-wall"
      label="Mur d’Abonnement"
      visible={visible}
      locked={locked}
      context={context}
    >
      <section className="container mx-auto px-4 lg:px-8 py-10 md:py-16">
        <div
          className={`relative overflow-hidden bg-card border border-border p-8 md:p-14 text-center max-w-4xl mx-auto shadow-lg transition-all ${cardShape}`}
        >
          {/* Halo lumineux d'accentuation en arrière-plan */}
          {accentGlow && (
            <div
              className="absolute -top-32 -left-32 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
              style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
            />
          )}
          {accentGlow && (
            <div
              className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none"
              style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
            />
          )}

          <div className="relative z-10 flex flex-col items-center">
            {/* Pastille incitative */}
            {incentivePill && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground mb-4">
                <Sparkles className="w-3.5 h-3.5 text-[var(--tenant-accent,hsl(var(--primary)))]" />
                <span>{incentivePill}</span>
              </div>
            )}

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground max-w-xl">
              {title}
            </h2>

            <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-lg leading-relaxed">
              {subtitle}
            </p>

            {/* Formulaire d'inscription */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (context.mode === 'editable') return;
              }}
              className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md"
            >
              <div className="relative w-full">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="votre.email@domaine.com"
                  disabled={context.mode === 'editable'}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--tenant-accent,hsl(var(--primary)))] transition-all shadow-xs"
                />
              </div>

              <button
                type="submit"
                disabled={context.mode === 'editable'}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all whitespace-nowrap active:scale-95 hover:opacity-95 cursor-pointer"
                style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
              >
                {buttonText}
              </button>
            </form>

            {/* Preuve sociale / Compteur de lecteurs */}
            {showSubscriberCount && (
              <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5 opacity-70" />
                <span>Déjà rejoint par plus de {subscriberCount} lecteurs curieux</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </BlockWrapper>
  );
}
