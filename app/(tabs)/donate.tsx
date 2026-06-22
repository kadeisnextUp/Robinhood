import { useAppConfig } from '@/contexts/appConfigContext';
import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { usePostHog } from 'posthog-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRequireAuth } from '../../hooks/useRequiredAuth';

type VotingPeriod = { id: string; start_date: string; end_date: string };

export default function DonateScreen() {
  const [userDonationAmount, setUserDonationAmount] = useState(0);
  const [weeklyPool, setWeeklyPool] = useState(0);
  const [votingPeriod, setVotingPeriod] = useState<VotingPeriod | null>(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [donating, setDonating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { requireAuth, user } = useRequireAuth();
  const posthog = usePostHog();
  const { config } = useAppConfig();

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadResults();
    setRefreshing(false);
  };

  const loadResults = async () => {
    try {
      const { data: period, error: periodError } = await supabase
        .from('voting_periods')
        .select('id, start_date, end_date')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (periodError) throw periodError;
      setVotingPeriod(period);

      const { data: poolData, error: poolError } = await supabase
        .from('user_donations')
        .select('amount, user_id')
        .eq('voting_period_id', period.id);

      if (!poolError && poolData) {
        const total = poolData.reduce((sum, row) => sum + row.amount, 0);
        setWeeklyPool(total);

        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const userTotal = poolData
            .filter(row => row.user_id === currentUser.id)
            .reduce((sum, row) => sum + row.amount, 0);
          setUserDonationAmount(userTotal);
        }
      }
    } catch (err) {
      console.error('Error loading voting period:', err);
    }
  };

  const handleDirectDonate = async () => {
    if (!config.donating_enabled) {
      Alert.alert('Donations Paused', 'Donations are temporarily paused. Check back soon.');
      return;
    }
    requireAuth(async () => {
      try {
        setDonating(true);
        posthog.capture('donation_initiated', {
          voting_period_id: votingPeriod?.id ?? null,
        });

        const donationUrl =
          `https://www.paypal.com/donate/?hosted_button_id=3EW92NUCZDTL6` +
          `&custom=${encodeURIComponent(user?.id ?? '')}`;

        const result = await WebBrowser.openAuthSessionAsync(
          donationUrl,
          'fundit://'
        );

        await loadResults();

        if (result.type === 'success') {
          Alert.alert(
            'Thank You!',
            'Your donation is being processed and will appear in the pool within a few minutes.',
            [{ text: 'OK' }]
          );
        }
      } catch (err) {
        console.error('Donation error:', err);
        const message = err instanceof Error ? err.message : 'Please try again.';
        Alert.alert('Something went wrong', message);
      } finally {
        setDonating(false);
      }
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* hero */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>THE GIVING POOL</Text>
        <Text style={styles.heroAmount}>${weeklyPool.toFixed(2)}</Text>
        <View style={styles.heroDivider} />
        <Text style={styles.heroMission}>
          100% of every dollar goes directly to this week's winning charity — no fees, no overhead.
        </Text>
        {timeRemaining ? (
          <View style={styles.countdownPill}>
            <Text style={styles.countdownText}>{timeRemaining}</Text>
          </View>
        ) : null}
      </View>

      {/* user contribution banner */}
      {userDonationAmount > 0 && (
        <View style={styles.contributionBanner}>
          <Text style={styles.contributionEmoji}>💵</Text>
          <Text style={styles.contributionText}>
            You've contributed{' '}
            <Text style={styles.contributionAmount}>${userDonationAmount.toFixed(2)}</Text>
            {' '}this week
          </Text>
        </View>
      )}

      {/* donation card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Make a Donation</Text>
        <Text style={styles.cardSubtitle}>
          You'll choose your amount securely on PayPal's page. Every dollar goes to this week's winning charity.
        </Text>

        {!config.donating_enabled && (
          <View style={styles.donationsPausedBanner}>
            <Ionicons name="warning-outline" size={15} color={colors.warning} />
            <Text style={styles.donationsPausedText}>Donations are temporarily paused</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.donateBtn, (donating || !config.donating_enabled) && styles.donateBtnDisabled]}
          onPress={handleDirectDonate}
          disabled={donating || !config.donating_enabled}
        >
          <Text style={styles.donateBtnText}>
            {donating ? 'Opening PayPal...' : !config.donating_enabled ? 'Donations Paused' : 'Donate with PayPal'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },

  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  heroEyebrow: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.secondary,
    letterSpacing: 4,
    marginBottom: spacing.sm,
    opacity: 0.85,
  },
  heroAmount: {
    fontSize: 56,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '900',
    color: colors.white,
    letterSpacing: -1,
    lineHeight: 60,
    marginBottom: spacing.md,
  },
  heroDivider: {
    width: 40,
    height: 2,
    backgroundColor: colors.cardBackground,
    opacity: 0.5,
    borderRadius: 1,
    marginBottom: spacing.md,
  },
  heroMission: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.white,
    textAlign: 'center',
    lineHeight: typography.sizes.body * 1.6,
    opacity: 0.9,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  countdownPill: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  countdownText: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
    color: colors.white,
    letterSpacing: 0.5,
  },

  contributionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '22',
    borderWidth: 1,
    borderColor: colors.success + '66',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  contributionEmoji: {
    fontSize: 18,
  },
  contributionText: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_500Medium',
    color: colors.white,
    fontWeight: typography.weights.medium,
  },
  contributionAmount: {
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.success,
  },

  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  cardTitle: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    marginBottom: spacing.lg,
    lineHeight: typography.sizes.sm * 1.6,
  },

  donationsPausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(243, 156, 18, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  donationsPausedText: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_500Medium',
    color: colors.warning,
    flex: 1,
  },
  donateBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  donateBtnDisabled: {
    opacity: 0.6,
  },
  donateBtnText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.white,
    letterSpacing: 0.3,
  },
});