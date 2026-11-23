// =====================================================================
// ⚠️ UnavailableNotice — « pas lu » ne se lit pas comme « rien »
// =====================================================================
// Composant de rendu serveur : un écran dont la lecture a échoué affiche cette
// ligne à la place de l'état vide. Le libellé est celui de la page — une file
// support dit « les dossiers n'ont pas pu être lus », une campagne dit « les
// campagnes n'ont pas pu être lues ». Le rôle `status` la rend annonçable sans
// voler le focus, et `polite` laisse l'utilisateur finir sa lecture.
// =====================================================================

import { AlertTriangle } from 'lucide-react';

export function UnavailableNotice({ what }: { what: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-[12px] leading-relaxed text-muted-foreground"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive-text" aria-hidden />
      <span>
        <span className="font-medium text-foreground">{what} : lecture impossible.</span> Ce qui
        s’affiche n’est pas « aucun élément » — la console n’a pas pu lire la réponse du serveur.
        Rechargez la page ou vérifiez l’état du service ; l’incident est journalisé côté serveur.
      </span>
    </p>
  );
}
