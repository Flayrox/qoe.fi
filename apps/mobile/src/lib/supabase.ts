import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Supabase s'appuie sur l'API URL du navigateur, incomplète dans le
// runtime React Native — on installe le polyfill officiel.
import 'react-native-url-polyfill/auto';

import { env } from './env';

// Fallback de stockage sécurisé pour le SSR / web server build d'Expo Router
const isServer = typeof window === 'undefined' && Platform.OS === 'web';
const storage = isServer
  ? {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    }
  : AsyncStorage;

// Client RN : contrairement à @qoe/supabase/client (browser, cookies via
// @supabase/ssr), ici la session est persistée dans AsyncStorage.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
