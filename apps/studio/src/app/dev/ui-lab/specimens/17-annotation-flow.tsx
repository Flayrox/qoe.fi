'use client';

// =====================================================================
// 17 · Annotation — le parcours, en vrai
// =====================================================================
// 📖 Les spécimens précédents montrent des MORCEAUX : la peau d'un
//    surlignage (16), un panneau (10), des boutons (08). Celui-ci monte le
//    moteur réel — `TextHighlighter` en mode document canonique — avec ses
//    vraies actions : sélectionner du texte, surligner, ouvrir le tiroir,
//    répondre, changer la visibilité, supprimer.
//
// 🎯 Ce qui se vérifie ici et nulle part ailleurs : la sélection et le
//    tiroir sont pilotés par des ÉVÉNEMENTS GLOBAUX (mouseup, keyup,
//    Échap, scroll). Un composant se juge sur ce qu'il fait aux gestes de
//    la personne qui lit, pas sur une capture.
//
// ⚠️ Aucune base de données : les callbacks ci-dessous sont l'équivalent
//    local des Server Actions (`createAnnotationCallbacks`). Ils calculent
//    les ancres comme le serveur — occurrence demandée comprise.
// =====================================================================

import { useCallback, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  TextHighlighter,
  AnnotationFilterPill,
  type AnnotationActionCallbacks,
  type AnnotationCitation,
  type AnnotationFilterMode,
  type AnnotationItem,
  type HighlightItem,
} from '@qoe/ui/annotations';
import { ReadingSettingsSheet } from '@qoe/ui/reader';
import { QuotedArticleCard } from '@qoe/ui/social';
import { Button } from '@qoe/ui/button';
import { DefectList, Variant } from '../specimen-frame';
import {
  anchor,
  INITIAL_PUBLIC_ANNOTATIONS,
  INITIAL_READER_HIGHLIGHTS,
  LAB_AUTHOR_ID,
  LAB_CURRENT_USER,
  LAB_DOCUMENT,
  LAB_DOCUMENT_SHA,
  LAB_OTHER_READER,
  LAB_READER,
  REPEATED_PASSAGE,
} from '../fixtures/annotation-document';

const CONTAINER_ID = 'lab-annotation-body';

/** L'article que les citations publiées montrent (métadonnées suffisantes
 *  pour la carte du feed — le document canonique du lab n'a pas d'URL). */
const LAB_QUOTE_ARTICLE = {
  id: 'lab-article',
  title: 'La lenteur comme méthode',
  slug: 'la-lenteur-comme-methode',
  isPremium: false,
  author: { name: 'Fay Moreau', username: 'fay', subdomain: 'la-lenteur' },
  publication: { name: 'La Lenteur', subdomain: 'la-lenteur' },
};

interface PublishedCitation {
  id: string;
  citation: AnnotationCitation;
  commentary: string;
}

export function AnnotationFlowSpecimen() {
  const [readerHighlights, setReaderHighlights] =
    useState<HighlightItem[]>(INITIAL_READER_HIGHLIGHTS);
  const [publicAnnotations, setPublicAnnotations] = useState<AnnotationItem[]>(
    INITIAL_PUBLIC_ANNOTATIONS
  );
  const [filterMode, setFilterMode] = useState<AnnotationFilterMode>('all');
  // Remonter le moteur est plus honnête qu'un « reset » partiel : l'état
  // interne (sélection, tiroir, filtre) repart vraiment de zéro.
  const [generation, setGeneration] = useState(0);
  // ⚠️ Chaque entrée porte un identifiant propre. Deux surlignages du même
  // passage produisaient le même texte, donc la même clé React : les lignes
  // du journal étaient dédupliquées en silence (et React criait dans la
  // console). Le texte sert à LIRE, l'identifiant à suivre.
  const [journal, setJournal] = useState<{ id: number; text: string }[]>([]);
  const journalId = useRef(0);
  // Ce que la citation a réellement publié : la carte rendue est celle du
  // feed, pas une maquette. C'est ici qu'on vérifie que la note, le passage
  // et l'auteur arrivent ensemble.
  const [publishedCitations, setPublishedCitations] = useState<PublishedCitation[]>([]);

  const record = useCallback((text: string) => {
    journalId.current += 1;
    const entry = { id: journalId.current, text };
    setJournal((prev) => [entry, ...prev].slice(0, 4));
  }, []);

  const callbacks = useMemo<AnnotationActionCallbacks>(
    () => ({
      onHighlightCreate: async ({ text, note, isPublic, quoteOrdinal = 0 }) => {
        const range = anchor(LAB_DOCUMENT, text, quoteOrdinal);
        if (!range) {
          // Le même refus que le serveur quand le passage a été ré-édité.
          return { ok: false, error: { code: 'ANCHOR_NOT_FOUND' } };
        }

        const id = `lab-live-${Date.now()}`;
        const createdAt = new Date().toISOString();

        // Deux formes, deux listes : le moteur garde les surlignages du
        // lecteur (`HighlightItem`, note obligatoire) séparés des
        // annotations publiques (`AnnotationItem`).
        const anchorFields = {
          id,
          text,
          quoteOrdinal,
          canonicalStart: range.start,
          canonicalEnd: range.end,
          contentSha: LAB_DOCUMENT_SHA,
          note: note ?? null,
          isOfficial: false,
          upvotesCount: 0,
          createdAt,
          reader: LAB_READER,
        };

        const created: AnnotationItem = { ...anchorFields, isPublic, isOfficial: false };

        if (isPublic) {
          setPublicAnnotations((prev) => [...prev, created]);
        } else {
          setReaderHighlights((prev) => [...prev, { ...anchorFields, isPublic: false }]);
        }

        record(
          isPublic
            ? `Surlignage public ancré à ${range.start}–${range.end} (occurrence ${quoteOrdinal})`
            : `Surlignage privé ancré à ${range.start}–${range.end} (occurrence ${quoteOrdinal})`
        );
        return { ok: true, data: created };
      },

      onUpvote: async (highlightId) => {
        setPublicAnnotations((prev) =>
          prev.map((item) =>
            item.id === highlightId
              ? { ...item, upvotesCount: item.upvotesCount + 1, hasUpvoted: true }
              : item
          )
        );
        record(`Vote « Utile » sur ${highlightId}`);
        return { ok: true };
      },

      onComment: async ({ highlightId, content }) => {
        const comment = {
          id: `lab-comment-${Date.now()}`,
          content,
          createdAt: new Date().toISOString(),
          author: {
            id: LAB_CURRENT_USER.id,
            name: LAB_CURRENT_USER.name,
            username: LAB_CURRENT_USER.username,
            logoUrl: LAB_CURRENT_USER.logoUrl,
          },
        };
        setPublicAnnotations((prev) =>
          prev.map((item) =>
            item.id === highlightId
              ? { ...item, comments: [...(item.comments ?? []), comment] }
              : item
          )
        );
        record(`Réponse ajoutée à ${highlightId}`);
        return { ok: true, data: comment };
      },

      onTogglePrivacy: async ({ highlightId, isPublic }) => {
        setPublicAnnotations((prev) =>
          prev.map((item) => (item.id === highlightId ? { ...item, isPublic } : item))
        );
        setReaderHighlights((prev) =>
          prev.map((item) => (item.id === highlightId ? { ...item, isPublic } : item))
        );
        record(`${highlightId} devient ${isPublic ? 'publique' : 'privée'}`);
        return { ok: true };
      },

      onUpdateNote: async ({ highlightId, note }) => {
        setPublicAnnotations((prev) =>
          prev.map((item) => (item.id === highlightId ? { ...item, note } : item))
        );
        setReaderHighlights((prev) =>
          prev.map((item) => (item.id === highlightId ? { ...item, note } : item))
        );
        record(`Note modifiée sur ${highlightId}`);
        return { ok: true };
      },

      onDelete: async (highlightId) => {
        setPublicAnnotations((prev) => prev.filter((item) => item.id !== highlightId));
        setReaderHighlights((prev) => prev.filter((item) => item.id !== highlightId));
        record(`Annotation supprimée (${highlightId})`);
        return { ok: true };
      },

      onCrosspost: async ({ text }) => {
        record(`Passage cité sur le Feed : « ${text.slice(0, 32)}… »`);
        return { ok: true };
      },

      onCiteAnnotation: async ({ citation, commentary = '' }) => {
        // Le serveur refuse un surlignage nu ou une annotation privée ; le
        // lab applique la même règle pour ne pas mentir sur le parcours.
        const publishable = Boolean(citation.note.trim()) && citation.note.trim().length > 0;
        if (!publishable) {
          return { ok: false, error: { code: 'ANNOTATION_NOT_CITABLE' } };
        }

        setPublishedCitations((prev) => [
          { id: `${Date.now()}-${prev.length}`, citation, commentary },
          ...prev,
        ]);
        record(
          `Citation publiée — ${citation.reader.username ? `@${citation.reader.username}` : 'auteur'} : « ${citation.note.slice(0, 40)}… » (ancres ${
            citation.canonicalStart ?? '—'
          }–${citation.canonicalEnd ?? '—'})`
        );
        return { ok: true, data: { url: '/home' } };
      },
    }),
    [record]
  );

  const restart = useCallback(() => {
    setReaderHighlights(INITIAL_READER_HIGHLIGHTS());
    setPublicAnnotations(INITIAL_PUBLIC_ANNOTATIONS());
    setFilterMode('all');
    setJournal([]);
    setPublishedCitations([]);
    setGeneration((prev) => prev + 1);
  }, []);

  const counts = [
    {
      label: 'officielles',
      value: publicAnnotations.filter((a) => a.isOfficial).length,
      className: 'bg-highlight/20',
    },
    {
      label: 'publiques',
      value: publicAnnotations.filter((a) => !a.isOfficial && Boolean(a.note?.trim())).length,
      className: 'bg-primary/15',
    },
    {
      label: 'privées',
      value: readerHighlights.filter((h) => Boolean(h.note?.trim())).length,
      className: 'bg-neural-blue/15',
    },
    {
      label: 'surlignages',
      value: readerHighlights.filter((h) => !h.note?.trim()).length,
      className: 'bg-muted-foreground/20',
    },
  ];

  return (
    <div className="grid gap-10">
      <Variant
        label="Surligner, annoter, répondre — sans base de données"
        kind="candidat"
        hint="Sélectionnez une phrase dans l’article : la barre apparaît sur la sélection. « Surligner » pose un simple surlignage (trait neutre, sans note) ; « Annoter » ouvre le formulaire (privée / publique) et crée une annotation. Cliquez ensuite sur une marque pour ouvrir le tiroir : un trait s’y annonce comme un surlignage et propose d’y ajouter une note — c’est ce texte qui en fait une annotation. Le journal en bas dit ce que le moteur a demandé au parent."
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {counts.map((count) => (
                <span
                  key={count.label}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className={`size-2.5 rounded-full border border-border/40 ${count.className}`}
                  />
                  <span className="font-mono tabular-nums text-foreground">{count.value}</span>
                  {count.label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <ReadingSettingsSheet
                filterMode={filterMode}
                onFilterModeChange={setFilterMode}
                allowPublicAnnotations
              />
              <Button size="sm" variant="ghost" onClick={restart}>
                <RotateCcw className="size-3.5" strokeWidth={1.75} />
                Recommencer
              </Button>
            </div>
          </div>

          <div className="rounded-panel border border-border/40 bg-card px-5 py-6 sm:px-7">
            <TextHighlighter
              key={generation}
              articleId="lab-article"
              creatorName="Fay Moreau"
              allowPublicAnnotations
              filterMode={filterMode}
              onFilterModeChange={setFilterMode}
              isAuthenticated
              initialHighlights={readerHighlights}
              publicHighlights={publicAnnotations}
              currentUserId={LAB_CURRENT_USER.id}
              currentUserProfile={LAB_CURRENT_USER}
              articleAuthorId={LAB_AUTHOR_ID}
              mainAppUrl="https://qoe.fi"
              containerId={CONTAINER_ID}
              canonicalDocument={LAB_DOCUMENT}
              contentClassName="article-prose max-w-none"
              callbacks={callbacks}
            />
          </div>

          {publishedCitations.length > 0 && (
            <div className="grid gap-3 rounded-panel border border-border/40 bg-card px-4 py-4">
              <p className="text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
                Sur Qoefi — la citation telle qu’elle part au feed
              </p>
              {publishedCitations.map((published) => (
                <div key={published.id} className="space-y-2">
                  {published.commentary.trim() && (
                    <p className="whitespace-pre-line text-sm leading-7 text-foreground">
                      {published.commentary}
                    </p>
                  )}
                  <QuotedArticleCard
                    article={LAB_QUOTE_ARTICLE}
                    quotedExcerpt={published.citation.excerpt}
                    citation={published.citation}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="rounded-panel border border-border/40 bg-muted/20 px-4 py-3">
            <p className="text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
              Journal des actions
            </p>
            {journal.length === 0 ? (
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                Rien encore — le moteur n’appelle le parent que quand vous agissez.
              </p>
            ) : (
              <ol className="mt-1.5 grid gap-1">
                {journal.map((entry) => (
                  <li key={entry.id} className="font-mono text-[11px] text-foreground">
                    {entry.text}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <DefectList
          items={[
            `Le passage « ${REPEATED_PASSAGE} » est écrit deux fois : la note publique du spécimen est ancrée sur la SECONDE occurrence (ordinal 1), et c’est celle-là qui porte le trait`,
            'Un surlignage n’est pas une annotation : créez-en un, ouvrez-le, le tiroir annonce « Surlignage » et propose « Ajouter une note » ; enregistrez ce texte, le même passage devient une annotation (discussion et vote apparaissent)',
            'Les marques sont peintes par offsets dans le texte canonique, jamais par recherche de texte : une citation à cheval sur deux blocs reste ancrée',
            'L’IA « Expliquer » reste visible mais désactivée : la fonction n’est pas branchée, aucune réponse n’est fabriquée, et le bouton est annoncé désactivé et décrit',
            `La personne qui lit est ${LAB_CURRENT_USER.name} : elle voit « modifier » et « supprimer » sur ses annotations, pas sur celles de ${LAB_OTHER_READER.name}`,
            'Supprimer une annotation que vous venez de créer laisse l’article, le journal et le tiroir dans un état cohérent : la marque part, le tiroir se referme, la page survit',
            'Citation — « Citer cette annotation » ne s’offre que sur une annotation partagée qui porte une note : la carte du feed reprend la note, le passage et le nom de son auteur, et pointe le passage par ses offsets. Un surlignage nu et une annotation privée affichent une explication à la place',
          ]}
        />
      </Variant>

      <Variant
        label="Ce que l’audit a corrigé sur ce parcours"
        kind="ecart"
        hint="Relevé en relisant le moteur ligne à ligne, pas en le réécrivant : chaque point est un défaut observable, avec sa cause."
      >
        <DefectList
          items={[
            'Ancrage — la barre passait `quoteOrdinal` pour les surlignages privés mais pas pour les publics : un passage répété était peint sur sa PREMIÈRE occurrence, en désaccord avec la note affichée dans le tiroir',
            'Succès partagé — le bouton « Citer » affichait « Cité ! » après un simple surlignage, parce que les deux actions lisaient le même état ; chaque action a maintenant le sien',
            'Suppression — le tiroir appelait `window.confirm()`, un dialogue natif qui bloque le fil, ignore le thème et ne dit pas ce qu’on supprime ; la confirmation est désormais dans le tiroir, le premier focus sur « Annuler »',
            'Lien Feed — « Voir » pointait sur `/feed` en dur : ouvert depuis un blog (`sous-domaine.qoe.fi`), il menait à un fil inexistant sur ce domaine',
            'Pulse du spotlight — la même liste de six classes était recopiée trois fois (types, deep-link, tiroir) ; elle vient maintenant d’une seule constante',
            'Annonces — l’erreur du formulaire et le succès de citation sont annoncés (`role="alert"`, `role="status"`), plus seulement peints',
            'Courses — supprimer et publier portent `aria-busy` et refusent le double envoi',
            'Tiroir figé — `allArticleAnnotations = []` en valeur par défaut recréait un tableau neuf à CHAQUE rendu : l’effet de resynchronisation se relançait, remettait l’état, provoquait un rendu, et le tiroir ne s’affichait plus du tout. La liste vide est désormais une constante de module, et l’état n’est remplacé que si la composition change',
            "Suppression qui casse la page — en mode document, le moteur retirait la marque à la main (insérer ses enfants dans le parent, puis la retirer) dans un corps que React possède : au commit suivant il levait « Failed to execute 'removeChild' on 'Node' » et la page entière tombait sur l’écran d’erreur. Le retrait manuel ne concerne plus que le moteur hérité",
            'Tiroir après suppression — il se rouvrait sur l’annotation suivante avec un compteur faux (« 1 / 4 » pour trois restantes), parce que la liste resynchronisée n’était pas filtrée ; il se referme maintenant, comme prévu',
            'Double peinture — un identifiant présent deux fois dans les listes venues du parent peignait deux `<mark>` superposés, de mêmes classes : le trait doublait sans rien signaler. Les listes sont assainies par identité (`dedupeAnnotations`)',
            'Nature — « Surligner » créait une annotation sans texte : le tiroir annonçait « Annotation », affichait « Aucune note » et ouvrait une discussion vide. Un surlignage reste désormais un surlignage (`annotationKind`), et c’est l’ajout d’un texte qui le promeut — sans champ `kind` séparé à maintenir en cohérence',
            'En-tête qui saute — le badge n’existait que pour les annotations officielles, et la pagination que pour plus d’un passage : chaque changement de nature décalait les flèches sous le curseur. Trois colonnes fixes (nature / pagination / fermeture), toujours occupées',
            'Chrome du tiroir — liseré dégradé de 3 px, guillemet de 88 px, rayons de 30 px et six tailles de texte hors échelle : le panneau tenait du décor. Une seule ossature (en-tête fixe, identité, citation, note, discussion), un accent de 6 px et un filet de citation ; seule la teinte dit la nature',
            'États partagés — « Surligner » et « Citer » lisaient le même `saving` : cliquer sur l’un faisait tourner la roue de l’autre, et « Citer » s’élargissait en « Cité ! » au milieu du clic. Un état par action, et deux libellés superposés dans la même largeur',
            'Avatars — le tiroir dessinait l’avatar à la main (une initiale sur un gris figé) : ni le thème déterministe, ni la silhouette de repli de `SafeAvatar`, et une URL cassée laissait une image brisée',
            'Erreur invisible — une erreur d’action posait son message dans le formulaire, jamais dans la barre de sélection : l’appel échouait sans rien dire',
            'Texte dupliqué — « Annoter » insérait une marque temporaire à la main dans un corps que React possède (`extractContents` + `insertNode`) : au rendu suivant, le passage apparaissait DEUX fois dans l’article. En mode document, la sélection native suffit pendant la saisie et le DOM n’est plus touché',
          ]}
        />
      </Variant>
    </div>
  );
}
