// =====================================================================
// 🕐 TimeElapsed — temps relatif + bascule date absolue au tap
//    (port de .reference/bluesky/src/view/com/util/TimeElapsed.tsx +
//    PostMeta : le timestamp devient « niceDate » quand on appuie)
// =====================================================================

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { niceDate, timeAgo } from '@/lib/format';

export function TimeElapsed({ timestamp, onPress }: { timestamp: string; onPress?: () => void }) {
  const [showAbsolute, setShowAbsolute] = useState(false);
  // Re-render chaque minute (tick) pour rafraîchir « 5m » → « 6m ».
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const label = showAbsolute ? niceDate(timestamp) : timeAgo(timestamp, now);

  return (
    <Pressable
      onPress={() => {
        setShowAbsolute((v) => !v);
        onPress?.();
      }}
      hitSlop={8}
      accessibilityLabel={niceDate(timestamp)}
    >
      <ThemedText type="small" style={styles.time} suppressHighlighting={false}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  time: {
    opacity: 0.6,
  },
});
