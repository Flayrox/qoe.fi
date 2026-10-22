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

import { Users } from 'lucide-react';
import type {
  NewsletterWallBlockProps,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { EditableText } from './EditableText';
import { NodeRenderer } from './NodeRenderer';
import { SubscribeForm } from '../../SubscribeForm';

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
      <section id="subscribe" className="container mx-auto px-4 lg:px-8 py-12 md:py-16">
        <div className="mx-auto max-w-5xl border-t border-border pt-10 md:pt-12">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-end">
            <div>
              {/* Surtitre / pastille incitative */}
              {incentivePill && (
                <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
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
                  className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground"
                />
              )}

              {slots?.subtitle ? (
                <div className="mt-2 max-w-md">
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
                  className="mt-2 text-sm text-muted-foreground max-w-md leading-relaxed"
                />
              )}

              {/* Preuve sociale / Compteur de lecteurs */}
              {showSubscriberCount && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Users className="w-3 h-3 opacity-70" />
                  <span>{subscriberCount} abonnés</span>
                </div>
              )}
            </div>

            {/* Formulaire d'inscription relié à l'API et au compte Qoefi */}
            <div>
              <SubscribeForm
                publicationId={publication.id || ''}
                authorName={publication.name || ''}
                accentColor={publication.accentColor || undefined}
                placeholder="votre.email@domaine.com"
                buttonText={buttonText}
                disabled={context.mode === 'editable'}
                className="w-full"
              />
              {slots?.actions && (
                <div className="mt-3 flex flex-wrap gap-2">
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
        </div>
      </section>
    </BlockWrapper>
  );
}
