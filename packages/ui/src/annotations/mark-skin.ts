// =====================================================================
// 🖍️ mark-skin — la peau des surlignages, une seule source
// =====================================================================
// 📖 Pourquoi ce fichier n'est pas un composant React : les surlignages ne
//    sont pas rendus par React. Le moteur d'annotation découpe des nœuds
//    texte (`Range`) et insère des `<mark>` dans le DOM de l'article, puis
//    les retire et les repeint à chaque changement de filtre. Un composant
//    ne peut pas s'insérer au milieu d'un texte déjà rendu, et un trait
//    unique en SVG serait faux dès que la citation passe sur deux lignes.
//
// 🎯 La répartition des responsabilités :
//    - ici, ce qui dépend de la NATURE de l'annotation : la classe de peau
//      (`qoe-mark-*`) et le curseur ;
//    - dans `packages/theme/src/styles/marks.css`, la recette complète :
//      teinte de fond, trait SVG cuit, survol, et la neutralité
//      typographique (`font: inherit`).
//
// 🎨 Quatre états de lecture, quatre peaux :
//    - officielle : l'auteur, double trait ambre + fond ambre ;
//    - publique   : un lecteur, trait plein vermillon + fond vermillon ;
//    - privée     : un lecteur, trait pointillé bleu + fond bleu ;
//    - surlignage : un passage marqué SANS texte, trait pointillé neutre,
//      aucun fond. C'est le « simple trait » qui précède l'annotation.
//
// ⚠️ Le discriminant est le TEXTE, pas la visibilité. Un surlignage public
//    sans note n'est pas une annotation publique : il reste un surlignage.
//    Un surlignage privé avec une note est une annotation privée. Les deux
//    listes du moteur (lecteur / publiques) ne suffisent donc pas à décider
//    de la peau — la décision vit dans `markKindFor`, appelée par les deux
//    moteurs de peinture.
//
// 🌓 Les tracés sont des tons moyens (ambre, vermillon, bleu, gris),
//    lisibles sur fond clair comme sur fond sombre ; les teintes, elles,
//    viennent des tokens et suivent le thème.
// =====================================================================

/** Nature visuelle d'un surlignage. `selection` n'existe que le temps de
 *  la saisie d'une note : la marque temporaire sous le curseur. */
export type MarkKind = 'official' | 'public' | 'private' | 'highlight' | 'selection';

/** Ce qu'un surlignage sait de lui-même au moment d'être peint. */
export interface MarkIdentity {
  isOfficial?: boolean;
  isPublic?: boolean;
  /** Le passage porte-t-il un texte d'annotation ? */
  hasNote?: boolean;
}

/**
 * La nature visuelle, décidée à UN seul endroit.
 *
 * - une marque officielle reste officielle, avec ou sans note ;
 * - sans note, c'est un surlignage (même s'il est public) ;
 * - avec une note, c'est une annotation publique ou privée.
 */
export function markKindFor({ isOfficial, isPublic, hasNote }: MarkIdentity): MarkKind {
  if (isOfficial) return 'official';
  if (!hasNote) return 'highlight';
  return isPublic ? 'public' : 'private';
}

/**
 * Classes posées sur le `<mark>`, par nature.
 *
 * ⚠️ Aucune classe typographique ici : ni graisse, ni style, ni famille.
 * La marque ne doit pas changer la police du passage — un paragraphe
 * surligné se lit exactement comme un paragraphe nu, à la marque près.
 * `marks.css` verrouille cela avec `font: inherit`.
 */
export const MARK_STYLE_CLASSES: Record<MarkKind, string> = {
  official: 'qoe-mark qoe-mark-official cursor-pointer rounded-xs',
  public: 'qoe-mark qoe-mark-public cursor-pointer rounded-xs',
  private: 'qoe-mark qoe-mark-private cursor-pointer rounded-xs',
  highlight: 'qoe-mark qoe-mark-highlight cursor-pointer rounded-xs',
  selection: 'qoe-mark qoe-mark-selection rounded-xs',
};

/**
 * Token d'accent de chaque nature, pour les surfaces qui ne peignent pas un
 * `<mark>` (tiroir, légende, compteur). Le tiroir pose la variable sur son
 * panneau et lit `--qoe-annotation-accent` ; il ne recopie aucune couleur.
 */
export const MARK_ACCENT_TOKENS: Record<MarkKind, string> = {
  official: '--annotation-official',
  public: '--annotation-public',
  private: '--annotation-private',
  highlight: '--annotation-highlight',
  selection: '--brand-vivid',
};

/** Toutes les natures, dans l'ordre d'affichage d'une légende. */
export const MARK_KINDS: MarkKind[] = ['official', 'public', 'private', 'highlight', 'selection'];

/** Classes d'un surlignage. Point d'entrée unique côté produit. */
export function markSkin(kind: MarkKind): string {
  return MARK_STYLE_CLASSES[kind];
}

/**
 * Peau d'un surlignage à partir de ce qu'il est, pas de la liste qui le
 * porte. C'est le point d'entrée que les moteurs de peinture doivent
 * utiliser : il rend impossible qu'un composant choisisse une autre règle.
 */
export function markSkinFor(identity: MarkIdentity): string {
  return markSkin(markKindFor(identity));
}
