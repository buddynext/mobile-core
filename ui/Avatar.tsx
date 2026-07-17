/**
 * Avatar — image with an initials fallback that ACTUALLY falls back.
 *
 * Two ways an avatar goes blank in RN, both handled here:
 *   1. SVG data URIs. The server sends `data:image/svg+xml;base64,…` avatars, and RN's
 *      <Image> silently renders NOTHING for SVG (it supports PNG/JPG data URIs only). So a
 *      truthy-but-unrenderable uri must be treated as "no image" up front — checking only
 *      `uri ? <Image> : <fallback>` is the bug that put a hole in every feed card.
 *   2. A real URL that 404s or times out. onError flips to the initials fallback so a dead
 *      gravatar link degrades instead of leaving a blank.
 *
 * Initials sit on a per-name colour so a wall of fallbacks is not a wall of identical
 * grey circles. Never crashes on an empty name.
 */

import { useColors } from '../theme/ThemeProvider';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export interface AvatarProps {
  uri?: string;
  name: string;
  size?: number;
}

/** RN cannot render these; treat as no-image so the fallback shows. */
function isRenderable(uri: string | undefined): uri is string {
  if (!uri) {
    return false;
  }
  // SVG data URIs and bare SVG markup are not renderable by <Image>.
  if (/^data:image\/svg\+xml/i.test(uri) || uri.trimStart().startsWith('<svg')) {
    return false;
  }
  return true;
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

/** Stable hue from the name, so each member's fallback is consistent and distinguishable. */
function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return h;
}

export function Avatar({ uri, name, size = 44 }: AvatarProps) {
  const colors = useColors();
  const [failed, setFailed] = useState(false);

  // A new uri gets a fresh chance to load.
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const dimension = { width: size, height: size, borderRadius: size / 2 };
  const showImage = isRenderable(uri) && !failed;

  if (showImage) {
    return (
      <Image
        source={{ uri }}
        style={[dimension, { backgroundColor: colors.surfaceSunken }]}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const hue = hueFor(name);
  return (
    <View
      style={[dimension, styles.fallback, { backgroundColor: `hsl(${hue}, 45%, 88%)` }]}
      accessible={false}
    >
      <Text style={[styles.text, { color: `hsl(${hue}, 55%, 32%)`, fontSize: size * 0.4 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
