import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Supabase s'appuie sur l'API URL du navigateur, incomplète dans le
// runtime React Native — on installe le polyfill officiel.
import 'react-native-url-polyfill/auto';

import { env } from './env';

// Client RN : contrairement à @qoe/supabase/client (browser, cookies via
// @supabase/ssr), ici la session est persistée dans AsyncStorage.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
