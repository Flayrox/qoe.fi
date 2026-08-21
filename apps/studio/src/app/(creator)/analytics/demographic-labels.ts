// ── Labels démographiques (pur utilitaire, PAS un fichier 'use server') ──
// Extrait du fichier actions.ts pour respecter la règle Turbopack :
// un fichier 'use server' ne peut exporter que des fonctions async.

export const GENDER_LABELS: Record<string, string> = {
  FEMALE: 'Femme',
  MALE: 'Homme',
  NON_BINARY: 'Non-binaire',
  OTHER: 'Autre',
  PREFER_NOT_TO_SAY: 'Préfère ne pas dire',
};

export const AGE_RANGE_LABELS: Record<string, string> = {
  UNDER_18: 'Moins de 18 ans',
  AGE_18_24: '18-24 ans',
  AGE_25_34: '25-34 ans',
  AGE_35_44: '35-44 ans',
  AGE_45_54: '45-54 ans',
  AGE_55_64: '55-64 ans',
  AGE_65_PLUS: '65 ans et +',
  PREFER_NOT_TO_SAY: 'Préfère ne pas dire',
};

export function labelDemographic(key: 'gender' | 'ageRange', value: string): string {
  if (key === 'gender') return GENDER_LABELS[value] ?? value;
  return AGE_RANGE_LABELS[value] ?? value;
}
