// Entrée RN-safe : évite l'index racine qui tire les actions serveur ('use server', @qoe/db).
import { QoeApiClient } from '@qoe/api-client/mobile';
import Constants from 'expo-constants';
import { isDevice } from 'expo-device';
import { Platform } from 'react-native';

// Port de l'API Hono locale (cf. apps/api + .env : NEXT_PUBLIC_API_URL).
const API_PORT = 3002;

/**
 * Résout l'hôte de l'API en fonction du contexte d'exécution :
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
  return `http://${resolveApiHost()}:${API_PORT}`;
}

export const apiClient = new QoeApiClient({
  baseUrl: getApiBaseUrl(),
});
