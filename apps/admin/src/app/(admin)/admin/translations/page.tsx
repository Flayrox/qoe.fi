import { getSystemConfigs } from '@/lib/admin-data';
import { TranslationCMS } from './TranslationCMS';
import frTranslations from '../../../../../../../messages/fr.json';
import enTranslations from '../../../../../../../messages/en.json';

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
  const defaultFr = flattenMessages(frTranslations);
  const defaultEn = flattenMessages(enTranslations);

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
