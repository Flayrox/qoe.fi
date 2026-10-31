// =====================================================================
// 🧾 annotation-list — une annotation a une identité
// =====================================================================
// 📖 Le moteur tient deux listes (`highlights` : les surlignages du lecteur,
//    `allPublic` : publics + officiels) et il les modifie lui-même après une
//    action, en attendant que le parent les lui renvoie. Quand le parent les
//    renvoie DÉJÀ mises à jour — c'est le cas en mode document canonique, où
//    c'est lui qui possède l'état — le même identifiant pouvait se retrouver
//    deux fois dans une liste.
//
// 🎯 Conséquence observée dans le lab : deux `<mark>` imbriqués, mêmes
//    classes, même texte, même `data-highlight-id`. Rien ne le signalait :
//    un surlignage peint deux fois reste visuellement plausible (le trait
//    se double simplement), et le tiroir ne voit qu'une seule marque.
//
//    La règle est donc posée une fois : `id` est une identité, une liste
//    n'en contient jamais deux fois la même.
// =====================================================================

/** Toute entité des listes d'annotations : une identité, rien de plus. */
interface Identified {
  id: string;
}

/**
 * Ajoute `item` s'il n'est pas déjà là. Retourne la MÊME liste quand l'id
 * est déjà présent : c'est ce qui évite un re-rendu inutile (et la marque
 * peinte deux fois).
 */
export function appendAnnotation<T extends Identified>(list: T[], item: T): T[] {
  return list.some((existing) => existing.id === item.id) ? list : [...list, item];
}

/**
 * Ne garde que la première apparition de chaque id.
 *
 * À appliquer aux listes qui viennent de l'extérieur (props, réponse
 * serveur) : elles ne sont pas garanties uniques, et c'est le seul endroit
 * où l'on peut encore empêcher la double peinture. Retourne la liste
 * d'origine quand elle est déjà propre.
 */
export function dedupeAnnotations<T extends Identified>(list: T[]): T[] {
  if (list.length < 2) return list;
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique.length === list.length ? list : unique;
}
