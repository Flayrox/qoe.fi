/**
 * Libellé du repli « Afficher N autres réponses » d'un fil.
 *
 * `t()` ne porte pas de pluriel : le libellé était concaténé à la main, ce qui
 * annonçait « Afficher 1 autres réponses » dès qu'une seule réponse était
 * repliée. Le singulier a donc son propre cas et sa propre clé de traduction.
 */
export function repliesMoreLabel(
  hiddenCount: number,
  translate: (key: string, fallback: string) => string
): string {
  if (hiddenCount <= 1) {
    return translate('thread.show_more_reply_singular', 'Afficher une autre réponse');
  }
  return `${translate('thread.show_more_replies', 'Afficher')} ${hiddenCount} ${translate(
    'thread.other_replies',
    'autres réponses'
  )}`;
}
