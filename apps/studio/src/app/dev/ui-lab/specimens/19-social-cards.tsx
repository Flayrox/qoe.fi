'use client';

// =====================================================================
// 💬 Spécimen 19 — Cartes sociales, citations et annotations
// =====================================================================
// 📖 Le sujet : une pensée, sa citation, l'article qu'elle cite, l'écho
//    qui la remonte et la citation d'annotation — avec ce que le produit
//    fait AUJOURD'HUI, et à côté, ce qu'on voudrait qu'il fasse. La chaîne
//    de citations est désormais portée par le type ET par le serveur : le
//    spécimen montre le rendu réel, pas une cible dessinée à la main.
//
// 🎯 Toutes les données sont locales. Aucun appel réseau, aucune image
//    distante : on juge la typographie, la densité et la hiérarchie.
// =====================================================================

import React from 'react';
import { t } from '@lingui/core/macro';
import { AuthModalProvider } from '@qoe/ui';
import {
  ThoughtCard,
  QuotedThoughtCard,
  type ThoughtData,
  type QuotedThoughtData,
} from '@qoe/ui/social';
import { QuotedArticleCard, type QuotedArticleData } from '@qoe/ui/social';
import { ArticleCard } from '@qoe/ui/cards';
import type { FeedArticleDTO } from '@qoe/sdk/types';
import type { AnnotationCitation } from '@qoe/ui/annotations';
import { DefectList, Variant } from '../specimen-frame';

// ─── Identités ───────────────────────────────────────────────────────
const MEDIA = {
  id: 'author-media',
  name: 'Le Journal Éco',
  username: 'journaleco',
  subdomain: 'journaleco',
  logoUrl: null,
  isCertified: true,
  type: 'MEDIA' as const,
};

const PERSON = {
  id: 'author-person',
  name: 'Camille Roux',
  username: 'camille',
  subdomain: null,
  logoUrl: null,
  isCertified: false,
  type: 'PERSONAL' as const,
};

const READER = {
  id: 'reader-lila',
  name: 'Lila Bensalem',
  username: 'lila',
  logoUrl: null,
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

// ─── Carte d'article (feed) ──────────────────────────────────────────
const FEED_ARTICLE: FeedArticleDTO = {
  id: 'feed-article-1',
  title: 'La ville sans voiture n’est pas une utopie',
  slug: 'la-ville-sans-voiture',
  content:
    'On a longtemps cru que retirer les voitures d’un centre-ville revenait à l’asphyxier. Les chiffres de dix villes européennes disent l’inverse : les commerces de proximité augmentent, la pollution baisse, et le temps de trajet médian ne bouge pas.',
  imageUrl: null,
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
    logoUrl: null,
    heroText: null,
    isCertified: true,
    type: 'MEDIA',
    journalist: {
      id: 'journalist-1',
      name: 'Camille Roux',
      username: 'camille',
      logoUrl: null,
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

// ─── Pensées ─────────────────────────────────────────────────────────
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

/** Une pensée qui cite une autre pensée. */
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
      'Une mémoire sans oubli est une prison. Ce n’est pas la capacité de stocker qui fait un archive, c’est la décision de ce qu’on laisse dehors.',
    createdAt: '2026-10-27T18:03:00.000Z',
    author: MEDIA,
  },
};

/** Une pensée qui cite un article surligné. */
const QUOTE_OF_ARTICLE: ThoughtData = {
  id: 'thought-article-quote',
  content:
    'Voilà le chiffre qu’on cherche depuis six mois. Et il ne vient pas d’un cabinet, il vient du terrain.',
  createdAt: '2026-10-28T14:05:00.000Z',
  author: PERSON,
  likesCount: 41,
  repliesCount: 6,
  repostsCount: 8,
  articleQuote: ARTICLE,
  quotedExcerpt: 'les commerces de proximité augmentent, la pollution baisse',
};

/** Une pensée qui cite une annotation : la note est la citation. */
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

/**
 * Écho : un repost pur, sans texte propre. Aujourd'hui la carte affiche
 * l'auteur d'origine (et non celui qui reposte), mais la ligne « a reposté »
 * n'existe pas encore : on ne sait pas toujours qui a fait remonter le post.
 */
const ECHO: ThoughtData = {
  id: 'echo-1',
  content: '',
  createdAt: '2026-10-29T09:00:00.000Z',
  author: PERSON,
  likesCount: 0,
  repliesCount: 0,
  repostsCount: 3,
  repost: {
    id: 'thought-echoed',
    content:
      'Le meilleur filtre à information reste le temps. Ce qui compte encore dans trois jours méritait peut-être d’être lu.',
    createdAt: '2026-10-27T07:15:00.000Z',
    author: MEDIA,
  },
};

/**
 * Chaîne de citations : `repost` est récursif et chaque maillon porte son
 * propre contexte. Une citation de citation n'est donc plus un cas perdu —
 * c'est un troisième point de vue, avec son auteur et son article.
 */
const INNER_QUOTE: QuotedThoughtData = {
  id: 'thought-inner',
  content:
    'Une mémoire sans oubli est une prison. Ce n’est pas la capacité de stocker qui fait un archive, c’est la décision de ce qu’on laisse dehors.',
  createdAt: '2026-10-27T18:03:00.000Z',
  author: MEDIA,
  articleQuote: ARTICLE,
  quotedExcerpt: 'les commerces de proximité augmentent, la pollution baisse',
};

/** Deuxième maillon : cite une pensée qui cite elle-même l'article. */
const MIDDLE_QUOTE: QuotedThoughtData = {
  id: 'thought-middle',
  content: 'Je cite une citation, et c’est déjà un troisième point de vue.',
  createdAt: '2026-10-29T10:00:00.000Z',
  author: PERSON,
  repost: INNER_QUOTE,
};

const QUOTE_OF_QUOTE: ThoughtData = {
  id: 'thought-quote-of-quote',
  content: 'Trois lectures d’un même passage. La troisième est la mienne.',
  createdAt: '2026-10-29T11:00:00.000Z',
  author: READER,
  likesCount: 3,
  repliesCount: 0,
  repostsCount: 0,
  repost: MIDDLE_QUOTE,
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

/** Écho d'une citation : le repost pur d'un post qui cite lui-même. */
const ECHO_OF_QUOTE: ThoughtData = {
  id: 'echo-of-quote',
  content: '',
  createdAt: '2026-10-30T09:00:00.000Z',
  author: READER,
  likesCount: 0,
  repliesCount: 0,
  repostsCount: 2,
  repost: MIDDLE_QUOTE,
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
          label="Pensée — timeline, focus et réponse"
          kind="candidat"
          hint="Une seule primitive, trois contextes. La timeline porte la surface continue (bord bas, fond de carte) ; focus et réponse héritent de la même typographie mais pas des mêmes connecteurs."
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
          label="Pensée citée — le premier niveau"
          kind="candidat"
          hint="La carte citée est un bloc cliquable à l’intérieur d’une carte cliquable : un seul bouton, atteignable au clavier, et le même rendu d’une page à l’autre. Les maillons suivants restent du contexte."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Frame>
              <ThoughtCard post={QUOTE_OF_THOUGHT} variant="timeline" currentUserId={null} />
            </Frame>
            <Frame>
              <QuotedThoughtCard post={INNER_QUOTE} />
            </Frame>
          </div>
        </Variant>

        <Variant
          label="Article cité — passage surligné"
          kind="candidat"
          hint="Le contexte du passage vient du serveur (avant / surligné / après). Sans lui, la carte replie sur l’extrait brut, puis sur le début du texte : trois qualités de rendu pour un même objet."
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                avec contexte serveur
              </p>
              <QuotedArticleCard
                article={ARTICLE}
                quotedExcerpt="les commerces de proximité augmentent, la pollution baisse"
              />
            </div>
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                pensée qui cite l’article
              </p>
              <Frame>
                <ThoughtCard post={QUOTE_OF_ARTICLE} variant="timeline" currentUserId={null} />
              </Frame>
            </div>
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                extrait seul (repli)
              </p>
              <QuotedArticleCard
                article={{ ...ARTICLE, quoteContext: null }}
                quotedExcerpt="les commerces de proximité augmentent, la pollution baisse"
              />
            </div>
          </div>
        </Variant>

        <Variant
          label="Article cité — citation d’annotation"
          kind="candidat"
          hint="Quand c’est une note qui est citée, la note prend la tête et le passage devient la preuve. Sans article (dépublié), la carte doit rester lisible et ne jamais rendre une pensée vide."
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                annotation + article
              </p>
              <QuotedArticleCard
                article={ARTICLE}
                citation={ANNOTATION}
                quotedExcerpt={ANNOTATION.excerpt}
              />
            </div>
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                article indisponible
              </p>
              <QuotedArticleCard article={null} citation={ANNOTATION} />
            </div>
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                pensée qui cite l’annotation
              </p>
              <Frame>
                <ThoughtCard post={QUOTE_OF_ANNOTATION} variant="timeline" currentUserId={null} />
              </Frame>
            </div>
          </div>
        </Variant>

        <Variant
          label="Carte d’article — la vitrine du feed"
          kind="actuel"
          hint="Même objet qu’une citation d’article, mais une autre identité visuelle : rayon 24 px, capsule auteur en verre dépoli posée sur l’image, titre à 21 px. Rien de tout ça n’est partagé avec QuotedArticleCard."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                standard
              </p>
              <ArticleCard
                article={FEED_ARTICLE}
                onOpenArticle={() => undefined}
                onOpenProfile={() => undefined}
              />
            </div>
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                à la une (featured) + payant
              </p>
              <ArticleCard
                article={{ ...FEED_ARTICLE, isPremium: true, readingTime: 12 }}
                featured
                onOpenArticle={() => undefined}
                onOpenProfile={() => undefined}
              />
            </div>
          </div>

          <DefectList
            items={[
              'La carte d’article n’a aucun composant commun avec la citation d’article : deux rayons, deux titres, deux capsules auteur.',
              'Sans `onOpenArticle`, le clic fait `window.location.href` : elle quitte la surcouche au lieu de l’ouvrir.',
              'Une pensée sans titre qui passerait par ce composant rend `null` (garde `isThought`) — un silence, pas une erreur.',
            ]}
          />
        </Variant>

        <Variant
          label="Écho — repost pur"
          kind="actuel"
          hint="Un écho n’a pas de texte : la carte emprunte l’auteur et le contenu de l’original. Mais elle perd le nom de la personne qui a reposté, et rien ne distingue un écho d’une pensée native."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Frame>
              <ThoughtCard post={ECHO} variant="timeline" currentUserId={null} />
            </Frame>
            <div className="rounded-panel border border-dashed border-border/50 p-4 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Cible</p>
              <p>
                Une ligne discrète en tête de carte — « @lila a reposté » — puis la carte d’origine
                intacte, avec son propre auteur. Le reposteur est un contexte, pas un auteur.
              </p>
            </div>
          </div>
        </Variant>

        <Variant
          label="Chaîne de citations — trois maillons et un article"
          kind="candidat"
          hint="La pensée cite une pensée qui cite une pensée qui cite un article. Chaque maillon garde son auteur, son texte et son contexte ; le premier porte la surface, les suivants s’accrochent à un filet de marque au lieu d’empiler des boîtes."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                chaîne complète
              </p>
              <Frame>
                <ThoughtCard post={QUOTE_OF_QUOTE} variant="timeline" currentUserId={null} />
              </Frame>
            </div>

            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                écho d’une citation
              </p>
              <Frame>
                <ThoughtCard post={ECHO_OF_QUOTE} variant="timeline" currentUserId={null} />
              </Frame>
            </div>

            <div>
              <p className="type-control-xs mb-2 uppercase tracking-wider text-muted-foreground">
                maillon supprimé
              </p>
              <Frame>
                <ThoughtCard post={BROKEN_CHAIN} variant="timeline" currentUserId={null} />
              </Frame>
            </div>

            <div className="rounded-panel border border-dashed border-border/50 p-4 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Règles de la chaîne</p>
              <ul className="grid gap-1.5">
                <li>
                  Trois maillons dessinés, puis « la chaîne continue » — on résume, on ne coupe pas.
                </li>
                <li>
                  Seul le premier maillon est un bouton : un bouton dans un bouton est un piège au
                  clavier.
                </li>
                <li>Un article cité garde son propre lien, même au fond de la chaîne.</li>
                <li>
                  Un maillon sans texte ni citation affiche un repli explicite, jamais une boîte
                  vide.
                </li>
              </ul>
            </div>
          </div>

          <DefectList
            items={[
              'Le reposteur d’un écho n’est toujours pas nommé au-dessus de la carte : on voit le texte, pas qui l’a fait remonter.',
              'La carte d’article du feed (ArticleCard) reste une seconde identité visuelle, non partagée avec la citation d’article.',
              'Un lien externe au troisième maillon est clippé à une ligne : la chaîne privilégie la densité, pas la lecture intégrale.',
            ]}
          />
        </Variant>

        <Variant
          label="Ce que les quatre cartes ont en commun"
          kind="candidat"
          hint="Même densité de métadonnées, même rayon, même bord de citation. Les divergences qui restent sont des décisions, pas des oublis."
        >
          <ul className="grid gap-2 text-xs leading-relaxed text-muted-foreground">
            <li>
              Toutes les cartes citées partagent <code className="font-mono">rounded-xl</code>, un
              fond <code className="font-mono">bg-muted/20</code> et un filet de marque à gauche.
            </li>
            <li>
              Les métadonnées passent par <code className="font-mono">type-control-xs</code> ; les
              extraits par la fonte serif italique, une seule fois.
            </li>
            <li>
              Le nom de l’auteur est toujours relié à la carte de survol ; le corps, jamais
              cliquable pour lui-même.
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
