'use client';

import { useState } from 'react';
import { Flag, Keyboard, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { ConfirmDeleteModal, HotkeyHelpModal, RecommendationModal, ReportModal } from '@qoe/ui';
import { DefectList, Variant } from '../specimen-frame';

/**
 * Spécimen 21 — les autres modales.
 *
 * 📖 Trois d'entre elles ne sont montées par aucun spécimen : l'aide des
 *    raccourcis (ouverte au clavier), la confirmation de suppression (le
 *    geste le plus destructif du produit) et le signalement (contenu
 *    sensible, décision humaine derrière). Les monter ici, c'est vérifier
 *    qu'elles tiennent le même contrat que le reste — pas les redessiner.
 *
 * ⚠️ Aucune action n'est envoyée : « Signaler » et « S'abonner » appellent
 *    de vraies Server Actions. Ouvrez, regardez, fermez.
 */

const LAB_PUBLICATIONS = [
  {
    id: 'la-lenteur',
    name: 'La Lenteur',
    slug: 'la-lenteur',
    subdomain: 'la-lenteur',
    description: 'Le temps long, l’encre lente.',
    authorName: 'Fay Moreau',
    authorHandle: 'fay',
    articlesCount: 42,
    subscribersCount: 1280,
  },
  {
    id: 'le-bruit',
    name: 'Le Bruit',
    slug: 'le-bruit',
    subdomain: 'le-bruit',
    description: 'L’actualité chaude, sans l’urgence.',
    authorName: 'Sacha Roux',
    authorHandle: 'sacha',
    articlesCount: 118,
    subscribersCount: 5400,
  },
  {
    id: 'contre-champ',
    name: 'Contre-champ',
    slug: 'contre-champ',
    subdomain: 'contre-champ',
    description: 'Regards décalés sur l’image.',
    authorName: 'Nina Bell',
    authorHandle: 'nina',
    articlesCount: 23,
    subscribersCount: 610,
  },
];

export function ModalsSpecimen() {
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);

  return (
    <div className="grid gap-10">
      <Variant
        label="Aide des raccourcis — le cas qui avait le plus besoin d’un dialogue"
        kind="candidat"
        hint="Elle s’ouvre en pressant « ? », donc au clavier, et c’était un div plein écran : ni role, ni piège du focus, ni Échap. Elle repose maintenant sur le Dialog du contrat ; le focus revient au déclencheur."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setHotkeysOpen(true)}>
            <Keyboard /> Aide des raccourcis
          </Button>
          <span className="font-mono text-[10.5px] text-muted-foreground">
            role=dialog · aria-modal · Échap · focus rendu
          </span>
        </div>

        <HotkeyHelpModal isOpen={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />

        <DefectList
          items={[
            'Avant : un `<div className="fixed inset-0">` — le lecteur d’écran continuait à parcourir la page derrière',
            'Avant : aucune gestion d’Échap, alors que la modale s’ouvre précisément au clavier',
            'Avant : le focus restait sur la page ; il est maintenant dans la boîte, puis rendu au déclencheur',
            'Le fond de la modale n’a plus de `bg-black/60` : le voile du contrat passe par `bg-foreground/25`, qui suit le thème',
          ]}
        />
      </Variant>

      <Variant
        label="Confirmation destructive — dire ce qu’on supprime"
        kind="candidat"
        hint="Le geste le plus dangereux du produit. Le titre et la description sont paramétrés par l’appelant, le bouton destructif porte le ton `danger` et un état d’attente réel (`loading`), qui bloque le double clic."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" tone="danger" onClick={() => setConfirmOpen(true)}>
            <Trash2 /> Supprimer une pensée
          </Button>
        </div>

        <ConfirmDeleteModal
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => true}
          title="Supprimer cette pensée ?"
          description="Cette action est irréversible. La pensée et ses interactions seront définitivement retirées de la plateforme."
        />

        <DefectList
          items={[
            'Le titre est « Supprimer cette pensée ? » : il nomme l’objet, pas l’action seule',
            'La description dit l’irréversibilité et la portée (les interactions partent avec la pensée)',
            'Le bouton destructif appelle `onConfirm` puis se ferme seulement si la réponse n’est pas `false` : un échec ne fait pas disparaître la fenêtre',
          ]}
        />
      </Variant>

      <Variant
        label="Signalement — un formulaire, pas un guichet"
        kind="candidat"
        hint="Cinq motifs, un champ libre facultatif, et un retour qui dit que le signalement est parti à la modération. La cible (`thought`, `article`, `user`, `comment`) est passée par l’appelant."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setReportOpen(true)}>
            <Flag /> Signaler le contenu
          </Button>
        </div>

        <ReportModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          targetId="lab-thought-1"
          targetType="thought"
          authorName="Camille"
        />

        <DefectList
          items={[
            'Les motifs sont des boutons sans `aria-pressed` ni groupe radio : le motif retenu n’existe pas pour un lecteur d’écran',
            'Un seul motif est présélectionné d’office (« Spam ») : un signalement envoyé sans lire part sur un motif faux',
            'La soumission appelle une vraie Server Action — ne l’envoyez pas depuis le Lab',
          ]}
        />
      </Variant>

      <Variant
        label="Recommandations après abonnement — le seul écran de ce type"
        kind="candidat"
        hint="Trois publications proposées, toutes cochées par défaut, une seule requête par choix retenu. C’est la modale la plus large du lot : elle n’a pas de dialogue du contrat, elle dessine son propre fond."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setRecommendOpen(true)}>
            <Sparkles /> Voir les recommandations
          </Button>
        </div>

        <RecommendationModal
          isOpen={recommendOpen}
          onClose={() => setRecommendOpen(false)}
          authorName="Fay Moreau"
          recommendations={LAB_PUBLICATIONS}
          subscriberEmail="lecteur@exemple.fr"
        />

        <DefectList
          items={[
            'Écrite à la main : `fixed inset-0` + `bg-black/50`, sans `role="dialog"` ni piège du focus — la même dette que l’ancienne modale de connexion',
            'Elle ne rend rien sans recommandation : un état vide est décidé par le parent, pas par la modale',
            '« S’abonner » envoie une vraie Server Action — ne validez pas depuis le Lab',
          ]}
        />
      </Variant>
    </div>
  );
}
