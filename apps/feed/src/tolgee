import './patch-console';
import { DevTools, Tolgee, FormatSimple } from '@tolgee/web';


const apiKey = process.env.NEXT_PUBLIC_TOLGEE_API_KEY;
const apiUrl = process.env.NEXT_PUBLIC_TOLGEE_API_URL;

export { ALL_LANGUAGES, DEFAULT_LANGUAGE, type AppLocale } from './locales';

export function TolgeeBase() {
  return Tolgee()
    .use(FormatSimple())
    .use(DevTools())
    .updateDefaults({
      apiKey,
      apiUrl,
      staticData: {
        fr: () => import('../../messages/fr.json'),
        en: () => import('../../messages/en.json'),
      },
    });
}
