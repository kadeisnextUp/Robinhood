import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface RetryStateProps {
  title: string;
  message: string;
  onRetry: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'light' | 'dark';
}

/**
 * Shared error/retry state for screens that fetch data on mount (home, receipts).
 * `tone` picks text/icon contrast for screens with a dark (brown) vs light (cream) background.
 */
const RetryState: React.FC<RetryStateProps> = ({
  title,
  message,
  onRetry,
  icon = 'cloud-offline-outline',
  tone = 'dark',
}) => {
  const pressScale = useSharedValue(1);
  const isLight = tone === 'light';

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handlePressIn = () => {
    pressScale.value = withTiming(0.96, { duration: 120 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { stiffness: 300, damping: 18 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRetry();
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify().damping(16)}
      style={styles.container}
    >
      <View style={[styles.iconBadge, isLight ? styles.iconBadgeOnDark : styles.iconBadgeOnLight]}>
        <Ionicons name={icon} size={30} color={colors.error} />
      </View>

      <Text style={[styles.title, { color: isLight ? colors.white : colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: isLight ? colors.primaryLight : colors.textLight }]}>
        {message}
      </Text>

      <Animated.View style={buttonAnimatedStyle}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconBadgeOnDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  iconBadgeOnLight: {
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
  },
  title: {
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_600SemiBold',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    textAlign: 'center',
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
    maxWidth: 280,
    marginBottom: spacing.lg,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
  },
});

export default RetryState;
