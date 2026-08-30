import { getSystemConfigs } from '@/lib/admin-data';
import { TranslationCMS } from './TranslationCMS';
import frTranslations from '../../../../../../../messages/fr.json';
import enTranslations from '../../../../../../../messages/en.json';
import frCatalog from '../../../../../../../messages/fr.js';
import enCatalog from '../../../../../../../messages/en.js';

function flattenMessages(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  let res: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const keyName = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      Object.assign(res, flattenMessages(v as Record<string, unknown>, keyName));
    } else if (typeof v === 'string') {
      res[keyName] = v;
    }
  }
  return res;
}

export default async function TranslationsPage() {
  // Même fusion qu'au runtime (packages/i18n/src/server.ts) : catalogues
  // compilés Lingui (macro t`...`) en priorité, puis clés sémantiques JSON.
  const defaultFr = {
    ...flattenMessages(frTranslations),
    ...(frCatalog.messages || {}),
  };
  const defaultEn = {
    ...flattenMessages(enTranslations),
    ...(enCatalog.messages || {}),
  };

  // Load db overrides (Go en primaire, fallback Prisma dev)
  let initialOverrides = { fr: {}, en: {} };
  try {
    const configs = await getSystemConfigs(['TRANSLATIONS_OVERRIDE']);
    const config = configs[0];
    if (config?.value) {
      initialOverrides = JSON.parse(config.value);
    }
  } catch (e) {
    console.error('Failed to load translation overrides:', e);
  }

  return (
    <TranslationCMS
      defaultFr={defaultFr}
      defaultEn={defaultEn}
      initialOverrides={initialOverrides}
    />
  );
}
