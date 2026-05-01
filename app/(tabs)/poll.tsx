import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';


const CARD_BG = '#170F05';
const CARD_BORDER_DIM = '#2A1E0E';

export default function CurrentResultsScreen() {
  const [results, setResults] = useState<{ id: string; name: string; votes: number }[]>([]);
  const [votingPeriod, setVotingPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: false });

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    loadResults();
  }, []);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      if (!votingPeriod?.end_date) return;
      const now = new Date();
      const end = new Date(votingPeriod.end_date);
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: true });
        return;
      }

      setTimeRemaining({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
        ended: false,
      });
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [votingPeriod]);

  const loadResults = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: period, error: periodError } = await supabase
        .from('voting_periods')
        .select('id, start_date, end_date')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (periodError) throw periodError;
      setVotingPeriod(period);

      const { data: periodCharities, error: charitiesError } = await supabase
        .from('voting_period_charities')
        .select(`charity_id, charities (id, name)`)
        .eq('voting_period_id', period.id);

      if (charitiesError) throw charitiesError;

      const charitiesWithVotes = await Promise.all(
        periodCharities.map(async (item) => {
          const { count } = await supabase
            .from('votes')
            .select('id', { count: 'exact', head: true })
            .eq('voting_period_id', period.id)
            .eq('charity_id', item.charity_id);

          return {
            id: item.charities.id,
            name: item.charities.name,
            votes: count ?? 0,
          };
        })
      );

      setResults(charitiesWithVotes);
    } catch (err) {
      setError('Failed to load results. Please try again.');
      console.error('Error loading results:', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadResults();
    setRefreshing(false);
  };

  const sortedResults = [...results].sort((a, b) => b.votes - a.votes);
  const totalVotes = sortedResults.reduce((sum, c) => sum + c.votes, 0);
  const getPercentage = (votes) => (totalVotes > 0 ? (votes / totalVotes) * 100 : 0);

  const getRankColor = (index) => {
    switch (index) {
      case 0: return colors.gold;
      case 1: return colors.silver;
      case 2: return colors.bronze;
      default: return colors.primaryLight;
    }
  };

  const getRankLabel = (index) => {
    switch (index) {
      case 3: return '4TH';
      default: return '5TH';
    }
  };

  const getRankEmoji = (index) => {
    switch (index) {
      case 0: return '🏆';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return null;
    }
  };

  const pad = (n) => String(n).padStart(2, '0');

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.loadingText}>LOADING RESULTS...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.retryText} onPress={loadResults}>TAP TO RETRY</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.emptyText}>NO SCORES YET</Text>
        <Text style={styles.emptySubtext}>Cast the first vote!</Text>
      </View>
    );
  }

  const timerUnits = [
    { val: pad(timeRemaining.days), unit: 'DAYS' },
    { val: pad(timeRemaining.hours), unit: 'HRS' },
    { val: pad(timeRemaining.minutes), unit: 'MIN' },
    { val: pad(timeRemaining.seconds), unit: 'SEC' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
      }
    >
      {/* header */}
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>WEEKLY</Text>
        <Text style={styles.headerTitle}>LEADERBOARD</Text>
        <View style={styles.headerDivider} />
      </View>

      {/* countdown timer */}
      {votingPeriod && (
        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>
            {timeRemaining.ended ? 'VOTING ENDED' : 'VOTING ENDS IN'}
          </Text>
          {!timeRemaining.ended && (
            <View style={styles.timerRow}>
              {timerUnits.flatMap(({ val, unit }, i) => [
                i > 0 && (
                  <Text key={`sep-${i}`} style={styles.timerColon}>:</Text>
                ),
                <View key={unit} style={styles.timerBlock}>
                  <Text style={styles.timerValue}>{val}</Text>
                  <Text style={styles.timerUnit}>{unit}</Text>
                </View>,
              ])}
            </View>
          )}
        </View>
      )}

      {/* total votes */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL VOTES</Text>
        <Text style={styles.totalCount}>{totalVotes.toLocaleString()}</Text>
      </View>

      {/* rank entries */}
      {sortedResults.map((charity, index) => {
        const percentage = getPercentage(charity.votes);
        const rankColor = getRankColor(index);
        const rankLabel = getRankLabel(index);
        const rankEmoji = getRankEmoji(index);
        const isFirst = index === 0;

        const card = (
          <View
            style={[
              styles.rankCard,
              isFirst && styles.rankCardFirst,
              { borderColor: isFirst ? rankColor : CARD_BORDER_DIM },
            ]}
          >
            {/* top row: rank badge + score */}
            <View style={styles.cardTopRow}>
              {rankEmoji ? (
                <Text style={styles.rankEmoji}>{rankEmoji}</Text>
              ) : (
                <View style={[styles.rankBadge, { borderColor: rankColor, backgroundColor: rankColor + '20' }]}>
                  <Text style={[styles.rankBadgeText, { color: rankColor }]}>{rankLabel}</Text>
                </View>
              )}
              <Animated.Text
                style={[
                  styles.scoreValue,
                  { color: rankColor },
                  isFirst && { opacity: glowAnim },
                ]}
              >
                {charity.votes.toLocaleString()}
                <Text style={styles.scoreUnit}> {charity.votes === 1 ? 'VOTE' : 'VOTES'}</Text>
              </Animated.Text>
            </View>

            {/* charity name */}
            <Text style={styles.charityName} numberOfLines={2}>
              {charity.name.toUpperCase()}
            </Text>

            {/* xp bar */}
            <View style={styles.xpTrack}>
              <View
                style={[
                  styles.xpFill,
                  { width: `${percentage}%`, backgroundColor: rankColor },
                ]}
              />
            </View>
            <Text style={[styles.percentText, { color: rankColor }]}>
              {percentage.toFixed(1)}%
            </Text>
          </View>
        );

        return isFirst ? (
          <Animated.View key={charity.id} style={{ transform: [{ scale: pulseAnim }] }}>
            {card}
          </Animated.View>
        ) : (
          <View key={charity.id}>{card}</View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  header: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  headerEyebrow: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.primaryLight,
    letterSpacing: 8,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    fontSize: 34,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 5,
  },
  headerDivider: {
    width: 48,
    height: 2,
    backgroundColor: colors.gold,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 1,
  },
  headerSub: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
    letterSpacing: 1,
  },

  timerCard: {
    backgroundColor: CARD_BG,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  timerLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.primaryLight,
    letterSpacing: 5,
    marginBottom: spacing.sm,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timerBlock: {
    alignItems: 'center',
    minWidth: 52,
    backgroundColor: colors.primary + '30',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  timerValue: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 2,
  },
  timerUnit: {
    fontSize: 8,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.primaryLight,
    letterSpacing: 2,
    marginTop: 2,
  },
  timerColon: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    color: colors.primaryLight,
    marginBottom: spacing.sm,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary + '30',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  totalLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.primaryLight,
    letterSpacing: 4,
  },
  totalCount: {
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 2,
  },

  rankCard: {
    backgroundColor: CARD_BG,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  rankCardFirst: {
    borderWidth: 2,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  rankEmoji: {
    fontSize: 28,
    fontFamily: 'Fredoka_400Regular',
    lineHeight: 32,
  },
  rankBadge: {
    borderWidth: 1.5,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  rankBadgeText: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    letterSpacing: 3,
  },
  scoreValue: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    letterSpacing: 1,
  },
  scoreUnit: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    letterSpacing: 2,
  },
  charityName: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 1.5,
    lineHeight: typography.sizes.body * 1.4,
    marginBottom: spacing.sm,
  },

  xpTrack: {
    height: 8,
    backgroundColor: '#FFFFFF12',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  xpFill: {
    height: '100%',
    borderRadius: 2,
  },
  percentText: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    letterSpacing: 1,
    textAlign: 'right',
  },


  loadingText: {
    color: colors.primaryLight,
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    letterSpacing: 4,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  retryText: {
    color: colors.gold,
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    letterSpacing: 3,
  },
  emptyText: {
    color: colors.white,
    fontSize: typography.sizes.xxl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    color: colors.grey,
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_400Regular',
    letterSpacing: 2,
  },
});
