import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { FunctionsHttpError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/authContext';
import { useRequireAuth } from '../../hooks/useRequiredAuth';
import { usePostHog } from 'posthog-react-native';

type VotingPeriod = { id: string; start_date: string; end_date: string };

const PRESET_AMOUNTS = ['5', '10', '25', '50'];

export default function DonateScreen() {
  const [donationAmount, setDonationAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [userDonationAmount, setUserDonationAmount] = useState(0);
  const [weeklyPool, setWeeklyPool] = useState(0);
  const [votingPeriod, setVotingPeriod] = useState<VotingPeriod | null>(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [donating, setDonating] = useState(false);

  const { requireAuth, user } = useRequireAuth();
  const { session } = useAuth();
  const posthog = usePostHog();

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

  const handlePresetSelect = (amount: string) => {
    setSelectedPreset(amount);
    setDonationAmount(amount);
  };

  const handleCustomInput = (text: string) => {
    setSelectedPreset(null);
    setDonationAmount(text);
  };

  const handleDirectDonate = async () => {
    const amount = parseFloat(donationAmount);

    if (isNaN(amount) || amount < 1.00) {
      Alert.alert('Invalid Amount', 'Minimum donation is $1.00.');
      return;
    }

    requireAuth(async () => {
      try {
        setDonating(true);
        posthog.capture('donation_initiated', {
          amount,
          voting_period_id: votingPeriod?.id ?? null,
          amount_type: selectedPreset ? 'preset' : 'custom',
        });

        const { data: sessionData, error: sessionError } = await supabase.functions.invoke('create-paypal-order', {
          body: { amount: amount.toFixed(2), userId: user?.id },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });

        if (sessionError) {
          let errorMessage = 'Could not create PayPal order';
          if (sessionError instanceof FunctionsHttpError) {
            try {
              const errorData = await sessionError.context.json();
              errorMessage = errorData.error || errorMessage;
            } catch {
              errorMessage = sessionError.message || errorMessage;
            }
          } else {
            errorMessage = sessionError?.message || errorMessage;
          }
          throw new Error(errorMessage);
        }

        if (!sessionData?.approvalUrl) {
          throw new Error('Could not create PayPal order');
        }

        const result = await WebBrowser.openAuthSessionAsync(
          sessionData.approvalUrl,
          'fundit://donate/success'
        );

        if (result.type === 'success') {
          const { data: captureData, error: captureError } = await supabase.functions.invoke('capture-paypal-order', {
            body: { orderId: sessionData.orderId, userId: user?.id, votingPeriodId: sessionData.votingPeriodId },
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });

          if (captureError) {
            let errorMessage = 'Payment capture failed';
            if (captureError instanceof FunctionsHttpError) {
              try {
                const errorData = await captureError.context.json();
                errorMessage = errorData.error || errorMessage;
              } catch {
                errorMessage = captureError.message || errorMessage;
              }
            } else {
              errorMessage = captureError?.message || errorMessage;
            }
            throw new Error(errorMessage);
          }

          if (!captureData?.success) {
            throw new Error('Payment was not completed');
          }

          posthog.capture('donation_completed', {
            amount,
            voting_period_id: sessionData.votingPeriodId ?? null,
          });
          setDonationAmount('');
          setSelectedPreset(null);
          await loadResults();

          Alert.alert(
            'Thank You!',
            `Your donation of $${amount.toFixed(2)} has been added to this week's pool!`,
            [{ text: 'OK' }]
          );
        } else if (result.type === 'cancel') {
          posthog.capture('donation_cancelled', { amount });
          Alert.alert('Donation Cancelled', 'Your donation was not completed.');
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
          <View style={styles.contributionDot} />
          <Text style={styles.contributionText}>
            You've contributed{' '}
            <Text style={styles.contributionAmount}>${userDonationAmount.toFixed(2)}</Text>
            {' '}this week
          </Text>
        </View>
      )}

      {/* donation form card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Make a Donation</Text>
        <Text style={styles.cardSubtitle}>
          Choose an amount or enter your own. Minimum $1.00.
        </Text>

        {/* preset amounts */}
        <View style={styles.presetRow}>
          {PRESET_AMOUNTS.map((amount) => (
            <TouchableOpacity
              key={amount}
              style={[
                styles.presetBtn,
                selectedPreset === amount && styles.presetBtnActive,
              ]}
              onPress={() => handlePresetSelect(amount)}
              disabled={donating}
            >
              <Text
                style={[
                  styles.presetBtnText,
                  selectedPreset === amount && styles.presetBtnTextActive,
                ]}
              >
                ${amount}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* custom amount input */}
        <View style={styles.inputWrapper}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.input}
            placeholder="Other amount"
            placeholderTextColor={colors.grey}
            keyboardType="decimal-pad"
            value={donationAmount}
            onChangeText={handleCustomInput}
            editable={!donating}
            returnKeyType="done"
            onSubmitEditing={handleDirectDonate}
          />
        </View>

        {/* donate button */}
        <TouchableOpacity
          style={[styles.donateBtn, donating && styles.donateBtnDisabled]}
          onPress={handleDirectDonate}
          disabled={donating}
        >
          <Text style={styles.donateBtnText}>
            {donating ? 'Processing...' : 'Donate with PayPal'}
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
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.cardBackground,
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
    fontSize: typography.sizes.sm,
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
  contributionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
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

  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  presetBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetBtnText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
    color: colors.textLight,
  },
  presetBtnTextActive: {
    color: colors.white,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.white,
  },
  dollarSign: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
    paddingVertical: 14,
    color: colors.text,
  },

  donateBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
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

  trustLine: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    textAlign: 'center',
    letterSpacing: 0.3,
    opacity: 0.8,
  },
});
