'use client';

// =====================================================================
// 💬 Spécimen 19 — Cartes sociales, images, citations et annotations
// =====================================================================
// 📖 Six objets cohabitent dans le fil : une pensée (texte ou médias),
//    la pensée qu'elle cite (avec ou sans image), l'article du feed
//    (avec ou sans couverture), l'article surligné, l'annotation citée
//    et l'écho qui remonte une publication.
//
// 🎯 Toutes les données et illustrations viennent des assets locaux du
//    dépôt (`/lab/*.svg`, `/avatars/*.svg`) : zéro appel réseau, rendu
//    déterministe en thème clair comme sombre.
// =====================================================================

import React from 'react';
import { t } from '@lingui/core/macro';
import { AuthModalProvider } from '@qoe/ui';
import {
  ThoughtCard,
  QuotedThoughtCard,
  QuotedArticleCard,
  type ThoughtData,
  type QuotedThoughtData,
  type QuotedArticleData,
} from '@qoe/ui/social';
import { ArticleCard } from '@qoe/ui/cards';
import type { FeedArticleDTO } from '@qoe/sdk/types';
import type { AnnotationCitation } from '@qoe/ui/annotations';
import { Variant } from '../specimen-frame';

// ─── Assets locaux (0 réseau) ────────────────────────────────────────
const IMG_CITY = '/lab/editorial-city.svg';
const IMG_TRANSIT = '/lab/editorial-transit.svg';
const IMG_ARCHIVE = '/lab/editorial-archive.svg';

// ─── Identités ───────────────────────────────────────────────────────
const MEDIA = {
  id: 'author-media',
  name: 'Le Journal Éco',
  username: 'journaleco',
  subdomain: 'journaleco',
  logoUrl: '/avatars/media-camille.svg',
  isCertified: true,
  type: 'MEDIA' as const,
};

const PERSON = {
  id: 'author-person',
  name: 'Camille Roux',
  username: 'camille',
  subdomain: null,
  logoUrl: '/avatars/avatar-1.svg',
  isCertified: false,
  type: 'PERSONAL' as const,
};

const READER = {
  id: 'reader-lila',
  name: 'Lila Bensalem',
  username: 'lila',
  logoUrl: '/avatars/avatar-3.svg',
  type: 'PERSONAL' as const,
};

// ─── Articles ────────────────────────────────────────────────────────
const ARTICLE: QuotedArticleData = {
  id: 'article-1',
  title: 'La ville sans voiture n’est pas une utopie',
  slug: 'la-ville-sans-voiture',
  isPremium: false,
  content:
    'On a longtemps cru que retirer les voitures d’un centre-ville revenait à l’asphyxier. Les chiffres de dix villes européennes disent l’inverse : les commerces de proximité augmentent, la pollution baisse, et le temps de trajet médian ne bouge pas.',
  quoteContext: {
    before: 'Les chiffres de dix villes européennes disent l’inverse : ',
    highlight: 'les commerces de proximité augmentent, la pollution baisse',
    after: ', et le temps de trajet médian ne bouge pas.',
    start: 148,
    end: 206,
    sha: 'sha-lab-article',
  },
  author: { name: 'Camille Roux', username: 'camille', subdomain: null },
  publication: { name: 'Le Journal Éco', subdomain: 'journaleco', customDomain: null },
};

const ARTICLE_ILLUSTRATED: QuotedArticleData = {
  ...ARTICLE,
  id: 'article-1-img',
  imageUrl: IMG_CITY,
  isPremium: true,
};

// ─── Carte d'article (feed) ──────────────────────────────────────────
const FEED_ARTICLE_WITH_COVER: FeedArticleDTO = {
  id: 'feed-article-cover',
  title: 'La ville sans voiture n’est pas une utopie',
  slug: 'la-ville-sans-voiture',
  content:
    'On a longtemps cru que retirer les voitures d’un centre-ville revenait à l’asphyxier. Les chiffres de dix villes européennes disent l’inverse : les commerces de proximité augmentent, la pollution baisse, et le temps de trajet médian ne bouge pas.',
  imageUrl: IMG_CITY,
  published: true,
  isPremium: false,
  readingTime: 7,
  createdAt: '2026-10-28T06:30:00.000Z',
  author: {
    id: 'author-media',
    name: 'Le Journal Éco',
    username: 'journaleco',
    subdomain: 'journaleco',
    customDomain: null,
    logoUrl: '/avatars/media-camille.svg',
    heroText: null,
    isCertified: true,
    type: 'MEDIA',
    journalist: {
      id: 'journalist-1',
      name: 'Camille Roux',
      username: 'camille',
      logoUrl: '/avatars/avatar-1.svg',
      isCertified: false,
      consentStatus: 'ACCEPTED',
    },
    contributors: [
      {
        id: 'journalist-2',
        name: 'Nadia Kaci',
        username: 'nadia',
        logoUrl: null,
        isCertified: false,
        consentStatus: 'ACCEPTED',
      },
    ],
  },
  category: { name: 'Urbanisme' },
  tags: ['mobilité', 'ville'],
  likesCount: 86,
  repliesCount: 12,
};

// ─── Pensées (texte & médias) ────────────────────────────────────────
const THOUGHT: ThoughtData = {
  id: 'thought-1',
  content:
    'Le vrai coût d’un clic n’est pas l’électricité. C’est l’attention qu’on ne rend jamais. Une page qui charge en 400 ms reste une page qu’on a décidé d’ouvrir — ce n’est pas la même dépense.',
  createdAt: '2026-10-28T09:12:00.000Z',
  author: MEDIA,
  likesCount: 128,
  repliesCount: 9,
  repostsCount: 14,
  isPinned: false,
};

const THOUGHT_SINGLE_IMAGE: ThoughtData = {
  id: 'thought-img-1',
  content:
    'Plan de circulation apaisée relevé ce matin sur trois axes : le corridor central absorbe 62 % des flux doux sans allonger la desserte locale.',
  createdAt: '2026-10-29T08:40:00.000Z',
  author: PERSON,
  attachments: [
    {
      id: 'att-city',
      url: IMG_CITY,
      type: 'IMAGE',
      altText:
        'Plan schématique d’un centre-ville piétonnisé traversé par un corridor vermillon de mobilité douce.',
    },
  ],
  likesCount: 64,
  repliesCount: 7,
  repostsCount: 11,
};

const THOUGHT_MULTI_IMAGES: ThoughtData = {
  id: 'thought-img-grid',
  content:
    'Comparaison avant / après sur dix ans : la courbe des commerces actifs croise celle du transit motorisé dès la deuxième année.',
  createdAt: '2026-10-29T10:15:00.000Z',
  author: MEDIA,
  attachments: [
    {
      id: 'att-1',
      url: IMG_CITY,
      type: 'IMAGE',
      altText: 'Trame urbaine et îlots végétalisés autour de l’axe central.',
    },
    {
      id: 'att-2',
      url: IMG_TRANSIT,
      type: 'IMAGE',
      altText:
        'Graphique montrant la baisse du trafic motorisé et la hausse simultanée des commerces actifs.',
    },
  ],
  likesCount: 93,
  repliesCount: 14,
  repostsCount: 19,
};

// ─── Pensées citées (texte & images) ─────────────────────────────────
const QUOTE_OF_THOUGHT: ThoughtData = {
  id: 'thought-quote',
  content: 'Ce passage mérite d’être relu deux fois. Surtout la dernière phrase.',
  createdAt: '2026-10-28T11:40:00.000Z',
  author: PERSON,
  likesCount: 12,
  repliesCount: 2,
  repostsCount: 1,
  repost: {
    id: 'thought-original',
    content:
      'Une mémoire sans oubli est une prison. Ce n’est pas la capacité de stocker qui fait une archive, c’est la décision de ce qu’on laisse dehors.',
    createdAt: '2026-10-27T18:03:00.000Z',
    author: MEDIA,
  },
};

/** Une pensée qui cite une pensée illustrée (1 image). */
const QUOTE_OF_IMAGE_THOUGHT: ThoughtData = {
  id: 'thought-quote-img',
  content:
    'Le croisement des deux courbes à t+24 mois répond à la principale objection des commerçants riverains.',
  createdAt: '2026-10-29T12:10:00.000Z',
  author: READER,
  likesCount: 29,
  repliesCount: 4,
  repostsCount: 5,
  repost: {
    id: 'thought-original-img',
    content:
      'Série chronologique sur dix villes européennes : trafic de transit en pointillés, vitalité commerciale en trait plein.',
    imageUrl: IMG_TRANSIT,
    createdAt: '2026-10-29T09:30:00.000Z',
    author: MEDIA,
  },
};

/** Une pensée illustrée qui cite elle-même une pensée à double planche. */
const QUOTE_WITH_MULTI_ATTACHMENTS: ThoughtData = {
  id: 'thought-quote-multi',
  content:
    'En mettant le carnet d’archive en regard des relevés de terrain, la continuité saute aux yeux.',
  createdAt: '2026-10-29T15:20:00.000Z',
  author: PERSON,
  likesCount: 18,
  repliesCount: 3,
  repostsCount: 2,
  repost: {
    id: 'thought-quoted-grid',
    content: 'Planches préparatoires du dossier d’urbanisme (terrain + séries longues).',
    attachments: [
      { id: 'q-att-1', url: IMG_CITY, type: 'IMAGE', altText: 'Planche cartographique' },
      { id: 'q-att-2', url: IMG_ARCHIVE, type: 'IMAGE', altText: 'Double page annotée' },
    ],
    createdAt: '2026-10-28T17:45:00.000Z',
    author: MEDIA,
  },
};

// ─── Citations d'articles & annotations ──────────────────────────────
const QUOTE_OF_ARTICLE: ThoughtData = {
  id: 'thought-article-quote',
  content:
    'Voilà le chiffre qu’on cherche depuis six mois. Et il ne vient pas d’un cabinet, il vient du terrain.',
  createdAt: '2026-10-28T14:05:00.000Z',
  author: PERSON,
  likesCount: 41,
  repliesCount: 6,
  repostsCount: 8,
  articleQuote: ARTICLE_ILLUSTRATED,
  quotedExcerpt: 'les commerces de proximité augmentent, la pollution baisse',
};

const ANNOTATION: AnnotationCitation = {
  id: 'annotation-1',
  note: 'C’est exactement le renversement qu’opère le livre : la contrainte n’est pas l’ennemie du désir, elle en est la condition.',
  excerpt: 'les commerces de proximité augmentent, la pollution baisse',
  quoteOrdinal: 1,
  reader: READER,
};

const QUOTE_OF_ANNOTATION: ThoughtData = {
  id: 'thought-annotation-quote',
  content: 'Lila met le doigt sur ce qui manquait à mon article.',
  createdAt: '2026-10-29T08:20:00.000Z',
  author: MEDIA,
  likesCount: 7,
  repliesCount: 1,
  repostsCount: 0,
  articleQuote: ARTICLE,
  annotationQuote: ANNOTATION,
};

// ─── Échos (reposts purs : texte & pensée illustrée) ─────────────────
const ECHO: ThoughtData = {
  id: 'echo-1',
  content: '',
  createdAt: '2026-10-29T09:00:00.000Z',
  author: PERSON,
  likesCount: 19,
  repliesCount: 2,
  repostsCount: 4,
  repost: {
    id: 'thought-echoed',
    content:
      'Le meilleur filtre à information reste le temps. Ce qui compte encore dans trois jours méritait peut-être d’être lu.',
    createdAt: '2026-10-27T07:15:00.000Z',
    author: MEDIA,
  },
};

const ECHO_WITH_IMAGE: ThoughtData = {
  id: 'echo-img',
  content: '',
  createdAt: '2026-10-30T10:30:00.000Z',
  author: READER,
  likesCount: 34,
  repliesCount: 5,
  repostsCount: 9,
  repost: {
    id: 'thought-echoed-img',
    content:
      'Les notes de marge du fonds municipal viennent d’être numérisées en haute définition.',
    attachments: [
      {
        id: 'echo-att-1',
        url: IMG_ARCHIVE,
        type: 'IMAGE',
        altText: 'Double page d’archive avec passage surligné et filet en marge.',
      },
    ],
    createdAt: '2026-10-29T16:10:00.000Z',
    author: PERSON,
  },
};

// ─── Chaînes de citations (avec et sans image imbriquée) ─────────────
const INNER_QUOTE: QuotedThoughtData = {
  id: 'thought-inner',
  content:
    'Une mémoire sans oubli est une prison. Ce n’est pas la capacité de stocker qui fait une archive, c’est la décision de ce qu’on laisse dehors.',
  createdAt: '2026-10-27T18:03:00.000Z',
  author: MEDIA,
  articleQuote: ARTICLE,
  quotedExcerpt: 'les commerces de proximité augmentent, la pollution baisse',
};

/** Deuxième maillon illustré : cite une pensée qui cite elle-même l'article. */
const MIDDLE_QUOTE_WITH_IMAGE: QuotedThoughtData = {
  id: 'thought-middle-img',
  content: 'Je relie la courbe de terrain au passage d’origine : tout tient ensemble.',
  imageUrl: IMG_TRANSIT,
  createdAt: '2026-10-29T10:00:00.000Z',
  author: PERSON,
  repost: INNER_QUOTE,
};

const QUOTE_OF_QUOTE_ILLUSTRATED: ThoughtData = {
  id: 'thought-quote-of-quote',
  content: 'Trois lectures d’un même passage — texte, preuve graphique et archive.',
  createdAt: '2026-10-29T11:00:00.000Z',
  author: READER,
  likesCount: 15,
  repliesCount: 2,
  repostsCount: 3,
  repost: MIDDLE_QUOTE_WITH_IMAGE,
};

/** Un maillon supprimé entre deux chargements : la carte doit rester lisible. */
const BROKEN_CHAIN: ThoughtData = {
  id: 'thought-broken-chain',
  content: 'Un maillon manquant ne doit jamais vider la carte.',
  createdAt: '2026-10-30T08:00:00.000Z',
  author: PERSON,
  repost: {
    id: 'thought-deleted',
    content: '',
    author: { id: 'gone', name: null, username: null, logoUrl: null },
    repost: null,
  },
};

/** Écho d'une chaîne illustrée : le repost pur d'un post qui cite lui-même. */
const ECHO_OF_QUOTE: ThoughtData = {
  id: 'echo-of-quote',
  content: '',
  createdAt: '2026-10-30T09:00:00.000Z',
  author: READER,
  likesCount: 8,
  repliesCount: 1,
  repostsCount: 2,
  repost: MIDDLE_QUOTE_WITH_IMAGE,
};

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-panel border border-border/50 bg-card">
        {children}
      </div>
    </div>
  );
}

export function SocialCardsSpecimen() {
  return (
    <AuthModalProvider isAuthenticated={false}>
      <div className="grid gap-12">
        <Variant
          label="Pensée — timeline et focus"
          kind="candidat"
          hint="Une seule primitive, plusieurs contextes. La timeline porte la surface continue ; le mode focus ouvre la typographie, l’horodatage complet et le décompte d’engagement."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Frame>
              <p className="type-control-xs px-4 pt-3 uppercase tracking-wider text-muted-foreground">
                timeline
              </p>
              <ThoughtCard post={THOUGHT} variant="timeline" currentUserId={null} />
              <ThoughtCard post={QUOTE_OF_THOUGHT} variant="timeline" currentUserId={null} />
            </Frame>

            <Frame>
              <p className="type-control-xs px-4 pt-3 uppercase tracking-wider text-muted-foreground">
                focus
              </p>
              <ThoughtCard post={THOUGHT} variant="focus" currentUserId={null} />
            </Frame>
          </div>
        </Variant>

        <Variant
          label="Pensée illustrée — image unique, grille et texte alternatif (ALT)"
          kind="candidat"
          hint="Les pièces jointes (`attachments`) s’adaptent de 1 à 4 vues en conservant un cadre capillaire (`border-border/40`) et un badge ALT accessible sans couleurs brutes."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Frame>
              <p className="type-control-xs px-4 pt-3 uppercase tracking-wider text-muted-foreground">
                image unique + badge alt
              </p>
              <ThoughtCard post={THOUGHT_SINGLE_IMAGE} variant="timeline" currentUserId={null} />
            </Frame>

            <Frame>
              <p className="type-control-xs px-4 pt-3 uppercase tracking-wider text-muted-foreground">
                grille multi-images (2 planches)
              </p>
              <ThoughtCard post={THOUGHT_MULTI_IMAGES} variant="timeline" currentUserId={null} />
            </Frame>
          </div>
        </Variant>

        <Variant
          label="Pensée citée — avec image unique ou grille de médias"
          kind="candidat"
          hint="Une pensée citée transporte ses images (`imageUrl` ou `attachments`) dans une hauteur maîtrisée (`max-h-48` au premier niveau), sans déborder sur la pensée qui commente."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                citation d’une pensée illustrée
              </p>
              <Frame>
                <ThoughtCard
                  post={QUOTE_OF_IMAGE_THOUGHT}
                  variant="timeline"
                  currentUserId={null}
                />
              </Frame>
            </div>

            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                citation d’une grille de 2 planches
              </p>
              <Frame>
                <ThoughtCard
                  post={QUOTE_WITH_MULTI_ATTACHMENTS}
                  variant="timeline"
                  currentUserId={null}
                />
              </Frame>
            </div>
          </div>
        </Variant>

        <Variant
          label="Écho — repost pur (texte et médias préservés)"
          kind="candidat"
          hint="L’écho place le reposteur en ligne de contexte au-dessus de l’auteur d’origine (icône alignée dans la gouttière d’avatar, survol de profil actif) et préserve intégralement les images de la pensée remontée."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                écho d’une pensée texte
              </p>
              <Frame>
                <ThoughtCard
                  post={ECHO}
                  variant="timeline"
                  currentUserId={null}
                  onOpenProfile={() => undefined}
                />
              </Frame>
            </div>

            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                écho d’une pensée illustrée
              </p>
              <Frame>
                <ThoughtCard
                  post={ECHO_WITH_IMAGE}
                  variant="timeline"
                  currentUserId={null}
                  isFollowingAuthor
                  onOpenProfile={() => undefined}
                />
              </Frame>
            </div>
          </div>
        </Variant>

        <Variant
          label="Chaîne de citations — trois maillons, image imbriquée et repli"
          kind="candidat"
          hint="Le premier maillon porte la surface ; les suivants s’accrochent à un filet de marque et réduisent leur vignette (`max-h-28`) pour que trois points de vue tiennent d’un seul regard."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                chaîne à 3 niveaux avec image au 2e maillon
              </p>
              <Frame>
                <ThoughtCard
                  post={QUOTE_OF_QUOTE_ILLUSTRATED}
                  variant="timeline"
                  currentUserId={null}
                />
              </Frame>
            </div>

            <div className="grid content-start gap-6">
              <div>
                <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                  écho d’une chaîne illustrée
                </p>
                <Frame>
                  <ThoughtCard post={ECHO_OF_QUOTE} variant="timeline" currentUserId={null} />
                </Frame>
              </div>

              <div>
                <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                  maillon supprimé (repli explicite)
                </p>
                <Frame>
                  <ThoughtCard post={BROKEN_CHAIN} variant="timeline" currentUserId={null} />
                </Frame>
              </div>
            </div>
          </div>
        </Variant>

        <Variant
          label="Article cité — passage surligné, vignette optionnelle & annotation"
          kind="candidat"
          hint="Quand l’article possède une couverture, une vignette discrète accompagne le titre sans jamais pousser le passage surligné. En citation d’annotation, la note du lecteur passe en tête."
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                pensée citant un article illustré + payant
              </p>
              <Frame>
                <ThoughtCard post={QUOTE_OF_ARTICLE} variant="timeline" currentUserId={null} />
              </Frame>
            </div>

            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                article cité sans image (texte pur)
              </p>
              <QuotedArticleCard
                article={ARTICLE}
                quotedExcerpt="les commerces de proximité augmentent, la pollution baisse"
              />
              <div className="mt-4">
                <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                  carte isolée de pensée citée
                </p>
                <QuotedThoughtCard post={INNER_QUOTE} />
              </div>
            </div>

            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                citation d’annotation & article dépublié
              </p>
              <Frame>
                <ThoughtCard post={QUOTE_OF_ANNOTATION} variant="timeline" currentUserId={null} />
              </Frame>
              <div className="mt-4">
                <QuotedArticleCard article={null} citation={ANNOTATION} />
              </div>
            </div>
          </div>
        </Variant>

        <Variant
          label="Carte d’article du feed (ArticleCard) — vitrine éditoriale"
          kind="candidat"
          hint="La carte d’article du feed conserve son identité propre : couverture pleine largeur avec capsule auteur flottante en verre dépoli, titre à 21 px et pied de lecture."
        >
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                standard avec couverture & co-auteurs
              </p>
              <ArticleCard
                article={FEED_ARTICLE_WITH_COVER}
                handleBookmarkToggle={() => undefined}
                onOpenArticle={() => undefined}
                onOpenProfile={() => undefined}
              />
            </div>

            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                à la une (featured) + payant
              </p>
              <ArticleCard
                article={{
                  ...FEED_ARTICLE_WITH_COVER,
                  id: 'feed-article-featured',
                  title: 'Archives municipales : ce que dix ans de carnets disent de nos rues',
                  imageUrl: IMG_ARCHIVE,
                  isPremium: true,
                  readingTime: 12,
                }}
                featured
                isBookmarked
                handleBookmarkToggle={() => undefined}
                onOpenArticle={() => undefined}
                onOpenProfile={() => undefined}
              />
            </div>
          </div>
        </Variant>

        <Variant
          label="Ce que les cartes partagent"
          kind="candidat"
          hint="Même densité de métadonnées, mêmes marques d’identité (rond personne, carré média) et mêmes règles de citation."
        >
          <ul className="grid gap-2 text-xs leading-relaxed text-muted-foreground">
            <li>
              La vitrine du feed (<code className="font-mono">ArticleCard</code>) garde sa
              couverture et sa capsule flottante ; les cartes citées (
              <code className="font-mono">QuotedThoughtCard</code>,{' '}
              <code className="font-mono">QuotedArticleCard</code>) restent sobres sur{' '}
              <code className="font-mono">bg-muted/20</code> avec filet de marque au second niveau.
            </li>
            <li>
              Les images des pensées et des citations gardent un cadre capillaire et une hauteur
              bornée (<code className="font-mono">max-h-48</code> au 1er niveau,{' '}
              <code className="font-mono">max-h-28</code> dans la chaîne).
            </li>
            <li>
              Le nom de l’auteur (et du reposteur sur un écho) est toujours relié à la carte de
              survol.
            </li>
            <li>
              {t`La citation imbriquée est un aperçu : seul le premier maillon ouvre la surcouche. L'article cité, lui, garde toujours son lien.`}
            </li>
          </ul>
        </Variant>
      </div>
    </AuthModalProvider>
  );
}
