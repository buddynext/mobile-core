/**
 * Avatar — image with an initials fallback.
 *
 * A member may have no avatar_url (or a data: SVG the server generated); either renders.
 * When there is no usable image, initials on a stable per-name colour beat a grey blank —
 * and it must never crash on an empty name.
 */

import { useColors } from '../theme/ThemeProvider';
import { Image, StyleSheet, Text, View } from 'react-native';

export interface AvatarProps {
  uri?: string;
  name: string;
  size?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({ uri, name, size = 44 }: AvatarProps) {
  const colors = useColors();
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[dimension, { backgroundColor: colors.surfaceSunken }]} />;
  }

  return (
    <View style={[dimension, styles.fallback, { backgroundColor: colors.surfaceSunken }]}>
      <Text style={[styles.text, { color: colors.ink2, fontSize: size * 0.4 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
