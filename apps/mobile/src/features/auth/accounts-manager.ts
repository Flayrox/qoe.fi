import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

const STORAGE_KEY = 'qoe_saved_accounts_v1';

export interface StoredAccount {
  id: string;
  email: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  isCertified?: boolean;
  refreshToken: string;
  accessToken: string;
  lastUsedAt: number;
}

/**
 * Une entrée n'est exploitable que si elle porte un id et des tokens :
 * `switchAccount` rejoue `setSession({access_token, refresh_token})`, donc une
 * entrée partielle (stockage abîmé, version antérieure) ferait échouer la
 * bascule au lieu d'être simplement ignorée.
 */
function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.refreshToken === 'string' &&
    entry.refreshToken.length > 0 &&
    typeof entry.accessToken === 'string'
  );
}

export async function getSavedAccounts(): Promise<StoredAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredAccount);
  } catch {
    return [];
  }
}

export async function saveAccount(
  session: Session,
  metadata?: {
    name?: string;
    username?: string;
    avatarUrl?: string | null;
    isCertified?: boolean;
  }
): Promise<StoredAccount[]> {
  if (!session.user || !session.refresh_token) return await getSavedAccounts();

  const accounts = await getSavedAccounts();
  const userId = session.user.id;
  const email = session.user.email ?? '';

  const fallbackName =
    metadata?.name ||
    (session.user.user_metadata?.full_name as string | undefined) ||
    (session.user.user_metadata?.name as string | undefined) ||
    email.split('@')[0] ||
    'Utilisateur';

  const fallbackUsername =
    metadata?.username ||
    (session.user.user_metadata?.username as string | undefined) ||
    email.split('@')[0] ||
    'user';

  const fallbackAvatar =
    metadata?.avatarUrl ?? (session.user.user_metadata?.avatar_url as string | undefined) ?? null;

  const existingIdx = accounts.findIndex((a) => a.id === userId);
  const updatedAccount: StoredAccount = {
    id: userId,
    email,
    name: fallbackName,
    username: fallbackUsername,
    avatarUrl: fallbackAvatar,
    isCertified: metadata?.isCertified ?? accounts[existingIdx]?.isCertified ?? false,
    refreshToken: session.refresh_token,
    accessToken: session.access_token,
    lastUsedAt: Date.now(),
  };

  let nextAccounts: StoredAccount[];
  if (existingIdx >= 0) {
    nextAccounts = [...accounts];
    nextAccounts[existingIdx] = {
      ...nextAccounts[existingIdx],
      ...updatedAccount,
      name: metadata?.name || nextAccounts[existingIdx].name,
      username: metadata?.username || nextAccounts[existingIdx].username,
      avatarUrl:
        metadata?.avatarUrl !== undefined
          ? metadata.avatarUrl
          : nextAccounts[existingIdx].avatarUrl,
    };
  } else {
    nextAccounts = [updatedAccount, ...accounts];
  }

  nextAccounts.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextAccounts));
  } catch (err) {
    console.error('Failed to save account to storage:', err);
  }

  return nextAccounts;
}

export async function removeStoredAccount(userId: string): Promise<StoredAccount[]> {
  const accounts = await getSavedAccounts();
  const filtered = accounts.filter((a) => a.id !== userId);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (err) {
    // Écriture échouée : le stockage contient encore la liste complète. On
    // renvoie donc CETTE liste (jamais `[]`, qui laisserait croire que le
    // compte courant est le dernier et empêcherait la bascule de secours).
    console.error('Failed to remove account from storage:', err);
    return accounts;
  }
}

export async function clearAllStoredAccounts(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear stored accounts:', err);
  }
}
