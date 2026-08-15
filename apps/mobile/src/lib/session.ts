// Détenteur du token d'accès courant, mis à jour par AuthProvider.
// Permet au client API (singleton module) de lire le token sans dépendre
// du contexte React (évite les imports circulaires).
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}
