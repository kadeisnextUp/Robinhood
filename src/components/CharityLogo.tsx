import { useEffect, useState } from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

// Charity logos point at third-party nonprofit sites, so they fail in ordinary ways:
// the org redesigns and the URL 404s, the file is an .svg that <Image> can't decode,
// or the stored value has stray whitespace from a copy/paste. Any of those used to
// leave a hole in the card. Show the charity's initial instead.
//
// Logos are being migrated to PNGs in a Supabase Storage bucket; until that's done
// some rows are still raw third-party URLs, and bucket URLs can 404 too, so this
// fallback stays useful either way.

// Same palette and hash the profile screen already used, so existing tiles keep
// the exact colour they had before this component was shared.
const TILE_COLORS = [
  '#C0714A', '#5B8A6B', '#4A7A8A', '#8A6B40',
  '#6B4A8A', '#4A8A6B', '#8A4A5B', '#5B7A4A',
];

const colorFor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
};

// Stored URLs have had trailing newlines in them, which break the fetch silently.
const cleanUrl = (url: string | null | undefined): string | null => {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
};

type Variant = 'tile' | 'banner';

type Props = {
  logoUrl: string | null;
  name: string;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

export default function CharityLogo({ logoUrl, name, variant = 'tile', style }: Props) {
  const [failed, setFailed] = useState(false);
  const url = cleanUrl(logoUrl);

  // Swapping charities inside a mounted card would otherwise keep the previous
  // charity's error state and hide a perfectly good logo.
  useEffect(() => {
    setFailed(false);
  }, [url]);

  const isBanner = variant === 'banner';
  const containerStyle = isBanner ? styles.banner : styles.tile;
  const initial = name?.trim().charAt(0).toUpperCase() || '?';
  const showFallback = !url || failed;

  // The profile tile has always sat on a coloured square, so keep that. The vote
  // card banner never had a background — it was a bare <Image> on the card — so
  // only tint it when we're drawing the initial instead of a real logo.
  const tinted = !isBanner || showFallback;

  return (
    <View
      style={[
        containerStyle,
        tinted && { backgroundColor: colorFor(name ?? '') },
        style,
      ]}
    >
      {showFallback ? (
        <Text style={isBanner ? styles.bannerInitial : styles.tileInitial}>{initial}</Text>
      ) : (
        <Image
          source={{ uri: url }}
          style={styles.img}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    padding: 6,
  },
  // Matches the original bare <Image> on the vote card: full width, 200 tall,
  // no radius, no padding, no background.
  banner: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  tileInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Fredoka_700Bold',
  },
  bannerInitial: {
    color: '#FFFFFF',
    fontSize: 64,
    fontFamily: 'Fredoka_700Bold',
  },
});
