// Entrée RN-safe : évite l'index racine qui tire les actions serveur ('use server', @qoe/db).
import { QoeApiClient } from '@qoe/api-client/mobile';
import Constants from 'expo-constants';
import { isDevice } from 'expo-device';
import { Platform } from 'react-native';

import { getAccessToken, setAccessToken } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Port de l'API Go locale (cf. apps/api : API_PORT=8090, backend unique).
const API_PORT = 8090;

/**
 * Résout l'hôte de l'API en fonction du contexte d'exécution :
 * - `EXPO_PUBLIC_API_URL` défini (prod/staging) → on l'utilise tel quel.
 * - simulateur iOS / émulateur Android / web → `localhost` atteint le Mac.
 * - appareil physique → on réutilise l'hôte qui a servi le bundle JS
 *   (hostUri de Metro), pour fonctionner sur le réseau local.
 */
function resolveApiHost(): string {
  // 1. Web utilise localhost
  if (Platform.OS === 'web') {
    return 'localhost';
  }

  // 2. Appareil physique : réutilise l'IP du Mac sur le réseau local fournie par Metro
  if (isDevice) {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      return hostUri.split(':')[0];
    }
  }

  // 3. Émulateur Android virtuel : utilise 10.0.2.2 pour atteindre la machine hôte
  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  // 4. Simulateur iOS par défaut
  return 'localhost';
}

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) {
    const trimmed = configured.replace(/\/$/, '');
    // Sur l'émulateur Android, si l'URL locale contient localhost ou 127.0.0.1, on la remplace intelligemment par 10.0.2.2
    if (Platform.OS === 'android' && !isDevice) {
      return trimmed.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
    }
    return trimmed;
  }
  return `http://${resolveApiHost()}:${API_PORT}`;
}

export const apiClient = new QoeApiClient({
  baseUrl: getApiBaseUrl(),
  // Token de session courant avec rafraîchissement transparent via Supabase
  getAuthToken: async () => {
    const current = getAccessToken();
    if (current) return current;
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        setAccessToken(data.session.access_token);
        return data.session.access_token;
      }
    } catch {
      // ignore
    }
    return null;
  },
});
