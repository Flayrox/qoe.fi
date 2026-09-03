// =====================================================================
// 🎛️ HighlightRowActions — Gérer un de ses surlignages (mobile)
// =====================================================================
// Deux boutons compacts pour un surlignage qu'on possède :
//   🌍/🔒 basculer privé ↔ public (PATCH /v1/highlights/{id})
//   🗑 supprimer, avec confirmation native (DELETE /v1/highlights/{id})
// L'état est toujours re-synchronisé depuis le serveur : on invalide les
// caches react-query des listes d'article et de bibliothèque (les `<mark>`
// inline de l'article disparaissent/reviennent avec le même cache).
// =====================================================================

import { useQueryClient } from '@tanstack/react-query';
import { Globe, Lock, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Toast } from '@/components/ui/toast';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';

export function HighlightRowActions({
  highlightId,
  isPublic,
}: {
  highlightId: string;
  isPublic: boolean;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const refreshLists = () => {
    // Toutes les listes de surlignages d'articles + la bibliothèque : les
    // deux partagent la même source de vérité côté serveur.
    void queryClient.invalidateQueries({ queryKey: ['highlights'] });
    void queryClient.invalidateQueries({ queryKey: ['library', 'highlights'] });
  };

  const toggleVisibility = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiClient.updateHighlight(highlightId, { isPublic: !isPublic });
      if (!res.ok) throw new Error(res.error);
      Toast.show(
        t(
          'highlights.visibility_done',
          res.data.isPublic ? 'Surlignage rendu public' : 'Surlignage rendu privé'
        ),
        'success'
      );
      refreshLists();
    } catch {
      Toast.show(t('highlights.error', 'Impossible de mettre à jour'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      t('highlights.delete_confirm_title', 'Supprimer ce surlignage ?'),
      t('highlights.delete_confirm_message', 'Cette action est définitive.'),
      [
        { text: t('common.cancel', 'Annuler'), style: 'cancel' },
        {
          text: t('common.delete', 'Supprimer'),
          style: 'destructive',
          onPress: () => void remove(),
        },
      ]
    );
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiClient.deleteHighlight(highlightId);
      if (!res.ok) throw new Error(res.error);
      Toast.show(t('highlights.delete_done', 'Surlignage supprimé'), 'success');
      refreshLists();
    } catch {
      Toast.show(t('highlights.error', 'Impossible de mettre à jour'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      {busy ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <>
          <Pressable
            onPress={() => void toggleVisibility()}
            hitSlop={6}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <View style={styles.actionRow}>
              {isPublic ? (
                <Lock size={14} color={theme.textSecondary} />
              ) : (
                <Globe size={14} color={theme.textSecondary} />
              )}
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {isPublic
                  ? t('highlights.make_private', 'Rendre privé')
                  : t('highlights.make_public', 'Rendre public')}
              </ThemedText>
            </View>
          </Pressable>
          <Pressable
            onPress={confirmDelete}
            hitSlop={6}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <View style={styles.actionRow}>
              <Trash2 size={14} color={theme.destructive} />
              <ThemedText type="small" style={{ color: theme.destructive }}>
                {t('highlights.delete', 'Supprimer')}
              </ThemedText>
            </View>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 24,
  },
  action: {
    paddingVertical: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: {
    opacity: 0.6,
  },
});
