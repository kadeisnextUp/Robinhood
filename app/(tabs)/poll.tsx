import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function CurrentResultsScreen() {  
  // component states
  const [results, setResults] = useState([]);
  const [votingPeriod, setVotingPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    loadResults();
  }, []);

  // calculate time remaining until Sunday 11:55 PM
  useEffect(() => {
    const calculateTimeRemaining = () => {
      if (!votingPeriod || !votingPeriod.end_date) return;
      
      const now = new Date();
      const end = new Date(votingPeriod.end_date);
      const diff = end - now;
      
      if (diff <= 0) {
        setTimeRemaining('Voting ended');
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h ${minutes}m remaining`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s remaining`);
      } else {
        setTimeRemaining(`${minutes}m ${seconds}s remaining`);
      }
    };
    
    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    
    return () => clearInterval(interval);
  }, [votingPeriod]);

  const loadResults = async () => {
    try {
      setLoading(true);
      setError(null);

      // get the current open voting period
      const { data: period, error: periodError } = await supabase
        .from('voting_periods')
        .select('id, start_date, end_date')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (periodError) throw periodError;

      setVotingPeriod(period);

      // get the 5 charities for this voting period
      const { data: periodCharities, error: charitiesError } = await supabase
        .from('voting_period_charities')
        .select(`
          charity_id,
          charities (
            id,
            name
          )
        `)
        .eq('voting_period_id', period.id);

      if (charitiesError) throw charitiesError;

      // get the vote count for each charity in this period
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

  // format voting period dates for display
  const formatVotingPeriod = () => {
    if (!votingPeriod) return '';
    const start = new Date(votingPeriod.start_date);
    const end = new Date(votingPeriod.end_date);
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Week of ${startStr} - ${endStr}`;
  };

  // sort results by votes highest first
  const sortedResults = [...results].sort((a, b) => b.votes - a.votes);

  // calculate total votes for percentage bars
  const totalVotes = sortedResults.reduce((sum, charity) => sum + charity.votes, 0);
  const getPercentage = (votes) => totalVotes > 0 ? (votes / totalVotes) * 100 : 0;

  // podium colors for top 3
  const getPodiumColor = (index) => {
    switch (index) {
      case 0: return colors.gold;
      case 1: return colors.silver;
      case 2: return colors.bronze;
      default: return colors.textDark;
    }
  };

  // trophy emoji for top 3
  const getTrophyEmoji = (index) => {
    switch (index) {
      case 0: return '🏆';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return null;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading results...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.retryText} onPress={loadResults}>Tap to retry</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.emptyText}>No votes yet this week</Text>
        <Text style={styles.emptySubtext}>Be the first to vote!</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.title}>Current Week's Results</Text>
      <Text style={styles.subtitle}>{formatVotingPeriod()}</Text>

      {timeRemaining && (
        <View style={styles.countdownBanner}>
          <Text style={styles.bannerText}>⏱️ Voting ends in: {timeRemaining}</Text>
        </View>
      )}

      {sortedResults.map((charity, index) => {
        const percentage = getPercentage(charity.votes);
        const barColor = getPodiumColor(index);
        const trophy = getTrophyEmoji(index);
        const rank = index + 1;

        return (
          <View key={charity.id} style={styles.resultCard}>
            <View style={styles.rankBadge}>
              {trophy ? (
                <Text style={styles.trophyEmoji}>{trophy}</Text>
              ) : (
                <Text style={styles.rankNumber}>#{rank}</Text>
              )}
            </View>

            <View style={styles.cardHeader}>
              <Text style={styles.charityName}>{charity.name}</Text>
              <Text style={[styles.voteCount, { color: barColor }]}>
                {charity.votes} {charity.votes === 1 ? 'vote' : 'votes'}
              </Text>
            </View>

            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${percentage}%`, backgroundColor: barColor }
                ]}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.white,
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.grey,
    marginBottom: spacing.lg,
  },
  countdownBanner: {
    backgroundColor: colors.primary,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  bannerText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semiBold,
  },
  resultCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    zIndex: 1,
    minWidth: 32,
    alignItems: 'center',
  },
  trophyEmoji: {
    fontSize: 32,
  },
  rankNumber: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.grey,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingLeft: spacing.xl,
  },
  charityName: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semiBold,
    color: colors.text,
    flex: 1,
  },
  voteCount: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semiBold,
    marginLeft: spacing.sm,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.grey + '30',
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.sm,
  },
  loadingText: {
    color: colors.text,
    fontSize: typography.sizes.md,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.sizes.lg,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryText: {
    color: colors.primary,
    fontSize: typography.sizes.md,
    textDecorationLine: 'underline',
  },
  emptyText: {
    color: colors.text,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    color: colors.grey,
    fontSize: typography.sizes.lg,
  },
});