'use client';

// =====================================================================
// AboutPageContent.tsx — Moteur de Page À Propos Personnalisable
// =====================================================================
// Inspiré du standard Substack (The Rose Period) :
// 1. Conteneur centré compact (max-w-[624px])
// 2. Titre éditorial avec bouton d'ancre cliquable (copie du lien)
// 3. Récit / Manifeste personnalisable (siteOptions.about.content ou bio)
// 4. Widget d'abonnement inline compact (capture email directe)
// 5. Illustration / Couverture légendée avec boutons Restack & Zoom
// 6. Blocs réassurance éditoriale ("Dans votre boîte mail", "Communauté")
// 7. Section People (Équipe / Contributeurs) intégrée
// =====================================================================

import React, { useState } from 'react';
import { Link as LinkIcon, Check, Loader2, Mail, MessageSquare, Maximize2 } from 'lucide-react';
import { cn } from '@qoe/utils';
import { PeopleSection } from './PeopleSection';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';
import type { TemplatePublicationContext, TemplateTeamMember } from '../schema';

export interface AboutCustomConfig {
  title?: string;
  manifestoHtml?: string;
  manifestoMarkdown?: string;
  captionedImageUrl?: string | null;
  imageCaption?: string | null;
  showSubscribeWidget?: boolean;
  showNewsletterReassurance?: boolean;
  showCommunitySection?: boolean;
  peopleTitle?: string;
}

export interface AboutPageContentProps {
  publication: TemplatePublicationContext;
  members?: TemplateTeamMember[];
  domain?: string;
  customConfig?: AboutCustomConfig;
  className?: string;
}

export function AboutPageContent({
  publication,
  members,
  customConfig,
  className,
}: AboutPageContentProps) {
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Fusion des configurations personnalisées (props OU publication.siteOptions.about)
  const siteOptionsAbout = (publication.siteOptions?.about as AboutCustomConfig | undefined) || {};
  const config: AboutCustomConfig = {
    title:
      customConfig?.title ||
      siteOptionsAbout.title ||
      `À propos de ${publication.name || 'la publication'}`,
    captionedImageUrl:
      customConfig?.captionedImageUrl ??
      siteOptionsAbout.captionedImageUrl ??
      publication.headerImageUrl ??
      null,
    imageCaption:
      customConfig?.imageCaption ??
      siteOptionsAbout.imageCaption ??
      (publication.heroText ? `${publication.name} — ${publication.heroText}` : null),
    showSubscribeWidget:
      customConfig?.showSubscribeWidget ?? siteOptionsAbout.showSubscribeWidget ?? true,
    showNewsletterReassurance:
      customConfig?.showNewsletterReassurance ?? siteOptionsAbout.showNewsletterReassurance ?? true,
    showCommunitySection:
      customConfig?.showCommunitySection ?? siteOptionsAbout.showCommunitySection ?? true,
    peopleTitle:
      customConfig?.peopleTitle || siteOptionsAbout.peopleTitle || 'Équipe & Contributeurs',
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSubscribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !publication.id) return;

    setIsLoading(true);
    try {
      const res = await subscribeToNewsletterAction({
        email: email.trim(),
        publicationId: publication.id,
      });
      if (res?.ok) {
        setIsSubscribed(true);
        setEmail('');
      }
    } catch {
      // Ignorer l'erreur silencieusement
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      data-testid="about-page-content"
      className={cn(
        'mx-auto w-full max-w-[624px] space-y-10 py-4 px-2 sm:px-0 text-foreground',
        className
      )}
    >
      {/* ── 1. En-tête : Titre principal avec ancre copiable ── */}
      <header className="space-y-3 group/header relative">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl sm:text-3xl md:text-[34px] font-bold tracking-tight text-foreground leading-tight">
            {config.title}
          </h1>
          <button
            type="button"
            onClick={handleCopyLink}
            title="Copier le lien direct"
            className="opacity-0 group-hover/header:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-[6px] hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            aria-label="Copier le lien"
          >
            {isCopied ? (
              <Check className="w-4 h-4 text-primary" />
            ) : (
              <LinkIcon className="w-4 h-4" />
            )}
          </button>
        </div>

        {publication.heroText && (
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            {publication.heroText}
          </p>
        )}
      </header>

      {/* ── 2. Manifeste / Récit de la publication ── */}
      <div className="prose prose-neutral dark:prose-invert max-w-none text-[15px] sm:text-base leading-relaxed space-y-4">
        {publication.bio ? (
          <p className="whitespace-pre-line text-foreground/90">{publication.bio}</p>
        ) : (
          <p className="text-foreground/90">
            Bienvenue sur <strong>{publication.name}</strong>. Une publication indépendante et
            souveraine dédiée aux récits profonds, analyses fouillées et réflexions régulières.
          </p>
        )}

        <p className="text-muted-foreground text-sm">
          Abonnez-vous pour recevoir les prochaines parutions directement par email et avoir un
          accès complet aux archives.
        </p>
      </div>

      {/* ── 3. Widget d'abonnement inline Substack ── */}
      {config.showSubscribeWidget && (
        <div className="p-4 sm:p-5 rounded-[8px] border border-border/50 bg-card/50 backdrop-blur-xs space-y-3 shadow-2xs">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Recevez les prochains numéros
            </h3>
            <p className="text-xs text-muted-foreground">
              Gratuit, sans publicité et respectueux de votre boîte mail.
            </p>
          </div>

          {isSubscribed ? (
            <div className="flex items-center gap-2 p-2.5 rounded-[6px] bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
              <Check className="w-4 h-4 shrink-0" />
              <span>
                Merci pour votre inscription ! Vous recevrez bientôt notre prochain article.
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubscribeSubmit} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Votre adresse email..."
                required
                className="h-10 flex-1 rounded-[6px] border border-border/60 bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
              />
              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="h-10 px-5 rounded-[6px] bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>S'abonner</span>}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── 4. Illustration / Couverture légendée avec actions ── */}
      {config.captionedImageUrl && (
        <figure className="space-y-2 group/figure relative">
          <div className="relative overflow-hidden rounded-[8px] border border-border/40 bg-muted/20">
            <img
              src={config.captionedImageUrl}
              alt={publication.name || 'Illustration'}
              className={cn(
                'w-full object-cover transition-all duration-300',
                isZoomed ? 'max-h-[85vh] object-contain' : 'max-h-[440px]'
              )}
            />

            {/* Boutons flottants de survol (Plein écran & Partage) */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover/figure:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setIsZoomed((prev) => !prev)}
                title={isZoomed ? 'Réduire' : 'Plein écran'}
                className="p-1.5 rounded-[6px] bg-background/80 hover:bg-background text-foreground shadow-2xs backdrop-blur-xs transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {config.imageCaption && (
            <figcaption className="text-xs text-muted-foreground text-center italic leading-relaxed px-2">
              {config.imageCaption}
            </figcaption>
          )}
        </figure>
      )}

      {/* ── 5. Blocs de réassurance éditoriale (Inbox & Communauté) ── */}
      {(config.showNewsletterReassurance || config.showCommunitySection) && (
        <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/30">
          {config.showNewsletterReassurance && (
            <div className="space-y-1.5 p-3.5 rounded-[8px] bg-muted/20 border border-border/30">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs sm:text-sm">
                <Mail className="w-4 h-4 text-primary" />
                <span>Toujours au bon endroit</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Chaque nouveau post est livré directement dans votre boîte mail, propre et lisible
                sans algorithme opaque.
              </p>
            </div>
          )}

          {config.showCommunitySection && (
            <div className="space-y-1.5 p-3.5 rounded-[8px] bg-muted/20 border border-border/30">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs sm:text-sm">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span>Espace de discussion</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Participez aux échanges en commentaire, partagez vos remarques et soutenez le
                travail des auteurs.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── 6. Section People (Équipe / Contributeurs) intégrée ── */}
      <div className="pt-4 border-t border-border/40">
        <PeopleSection
          publication={publication}
          members={members}
          title={config.peopleTitle}
          description={`Découvrez les personnes qui conçoivent et animent ${publication.name || 'cette publication'}.`}
        />
      </div>
    </div>
  );
}
