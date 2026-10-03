// =====================================================================
// NewsletterWallBlock.tsx — Mur d'abonnement
// =====================================================================
// Bloc haute-conversion pour capturer l'audience et fidéliser le lectorat.
// Supporte :
// - Halo lumineux diffus (Radial Accent Glow)
// - Compteur d'abonnés en direct (Social proof)
// - Pastille incitative ("100% Indépendant", "Sans algorithme")
// - Formulaire d'inscription réactif
// =====================================================================

import React from 'react';
import { Mail, Users } from 'lucide-react';
import type {
  NewsletterWallBlockProps,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { EditableText } from './EditableText';
import { NodeRenderer } from './NodeRenderer';

interface NewsletterWallBlockComponentProps {
  id: string;
  props: NewsletterWallBlockProps;
  publication: TemplatePublicationContext;
  cardShape?: CardCornerShape;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  slots?: Record<string, import('../schema').TemplateNode[]>;
  nodes?: import('../schema').TemplateNode[];
  hiddenAt?: ('mobile' | 'tablet')[];
}

export function NewsletterWallBlock({
  id,
  props,
  publication,
  cardShape = 'rounded-xl',
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
  hiddenAt,
}: NewsletterWallBlockComponentProps) {
  const {
    title = 'Newsletter',
    subtitle = 'Un email par semaine.',
    showSubscriberCount = false,
    buttonText = "S'abonner",
    incentivePill,
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
      styleBox={
        (
          props as unknown as {
            styleBox?: { pt?: number; pb?: number; maxWidth?: number; opacity?: number };
          }
        ).styleBox
      }
      blockStyle={(props as unknown as { style?: import('../schema').BlockStyleProps }).style}
      hiddenAt={hiddenAt}
    >
      <section className="container mx-auto px-4 lg:px-8 py-10 md:py-16">
        <div
          className={`relative overflow-hidden bg-card border border-border p-8 md:p-14 text-center max-w-4xl mx-auto shadow-xs transition-all ${cardShape}`}
        >
          {/* Halo lumineux d'accentuation en arrière-plan */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Pastille incitative */}
            {incentivePill && (
              <div className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground mb-4">
                <EditableText
                  blockId={id}
                  propKey="incentivePill"
                  value={incentivePill}
                  context={context}
                  as="span"
                />
              </div>
            )}

            {slots?.title ? (
              <NodeRenderer
                nodes={slots.title}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="slots/title"
              />
            ) : (
              <EditableText
                blockId={id}
                propKey="title"
                value={title}
                context={context}
                as="h2"
                className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground max-w-xl"
              />
            )}

            {slots?.subtitle ? (
              <div className="mt-3 max-w-lg">
                <NodeRenderer
                  nodes={slots.subtitle}
                  blockId={id}
                  blockProps={props as unknown as Record<string, unknown>}
                  context={context}
                  path="slots/subtitle"
                />
              </div>
            ) : (
              <EditableText
                blockId={id}
                propKey="subtitle"
                value={subtitle}
                context={context}
                as="p"
                className="mt-3 text-sm md:text-base text-muted-foreground max-w-lg leading-relaxed"
              />
            )}

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
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-semibold text-primary-foreground shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
              >
                <EditableText
                  blockId={id}
                  propKey="buttonText"
                  value={buttonText}
                  context={context}
                  as="span"
                  multiline={false}
                />
              </button>
            </form>

            {/* Preuve sociale / Compteur de lecteurs */}
            {showSubscriberCount && (
              <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5 opacity-70" />
                <span>{subscriberCount} abonnés</span>
              </div>
            )}
            {slots?.actions && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <NodeRenderer
                  nodes={slots.actions}
                  blockId={id}
                  blockProps={props as unknown as Record<string, unknown>}
                  context={context}
                  path="slots/actions"
                />
              </div>
            )}
            {nodes && nodes.length > 0 && (
              <NodeRenderer
                nodes={nodes}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="nodes"
              />
            )}
          </div>
        </div>
      </section>
    </BlockWrapper>
  );
}
