'use client';

import { ComboBox, type ComboBoxProps } from './combobox';

// =====================================================================
// ✍️ Autocomplete — filtrer, puis garder ce qu'on a écrit
// =====================================================================
// 📖 La différence avec `ComboBox` n'est pas cosmétique : ici la valeur
//    saisie est TOUJOURS acceptée. On cherche une étiquette existante pour
//    éviter les doublons, pas pour contraindre la saisie.
//
// 🎯 Trois réglages, une seule primitive : ouverture à la frappe, valeur
//    libre, effacement possible. Dupliquer le rendu aurait produit la
//    énième paire de composants qui divergent au premier correctif.
// =====================================================================

export type AutocompleteProps = Omit<
  ComboBoxProps,
  'allowsCustomValue' | 'menuTrigger' | 'clearable' | 'onClear'
>;

export function Autocomplete(props: AutocompleteProps) {
  return <ComboBox {...props} allowsCustomValue clearable menuTrigger="input" />;
}
