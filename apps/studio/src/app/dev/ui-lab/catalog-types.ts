// Types de l'inventaire généré par scripts/ui-catalog.mjs

export type CatalogItem = {
  name: string;
  path: string;
  lines: number;
  source: string;
  /** Nombre de fichiers d'app qui importent ce module partagé. null pour un fichier d'app. */
  usages: number | null;
};

export type CatalogFamily = {
  id: string;
  label: string;
  items: CatalogItem[];
};

export type CatalogSignals = {
  primitivesNeverImported: number;
  primitivesTotal: number;
  rawButtons: number;
  rawButtonFiles: number;
  nativeSelectFiles: number;
  rawInputFiles: number;
  handRolledOverlays: number;
};

export type Catalog = {
  generatedAt: string;
  total: number;
  signals: CatalogSignals;
  families: CatalogFamily[];
};
