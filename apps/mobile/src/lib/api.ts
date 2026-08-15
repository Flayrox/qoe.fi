// Entrée RN-safe : évite l'index racine qui tire les actions serveur ('use server', @qoe/db).
import { QoeApiClient } from '@qoe/api-client/mobile';
import Constants from 'expo-constants';
import { isDevice } from 'expo-device';
import { Platform } from 'react-native';

import { getAccessToken } from '@/lib/session';

// Port de l'API Go locale (cf. apps/api-go : PORT=8080, backend unique).
const API_PORT = 8080;

/**
 * Résout l'hôte de l'API en fonction du contexte d'exécution :
 * - `EXPO_PUBLIC_API_URL` défini (prod/staging) → on l'utilise tel quel.
 * - simulateur iOS / émulateur Android / web → `localhost` atteint le Mac.
 * - appareil physique → on réutilise l'hôte qui a servi le bundle JS
 *   (hostUri de Metro), pour fonctionner sur le réseau local.
 */
function resolveApiHost(): string {
  if (Platform.OS === 'web' || !isDevice) {
    return 'localhost';
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }
  return 'localhost';
}

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  return `http://${resolveApiHost()}:${API_PORT}`;
}

export const apiClient = new QoeApiClient({
  baseUrl: getApiBaseUrl(),
  // Token de session courant (mis à jour par AuthProvider via lib/session).
  getAuthToken: () => getAccessToken(),
});
