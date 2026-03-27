import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { FunctionsHttpError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRequireAuth } from '../../hooks/useRequiredAuth';

export default function DonateScreen() {
  const [donationAmount, setDonationAmount] = useState('');
  const [userDonationAmount, setUserDonationAmount] = useState(0);
  const [weeklyPool, setWeeklyPool] = useState(0);
  const [votingPeriod, setVotingPeriod] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [loading, setLoading] = useState(true);
  const [donating, setDonating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { requireAuth, user } = useRequireAuth();

  useEffect(() => {
    loadResults();
  }, []);

  // calculate time remaining until end of voting period
  useEffect(() => {
    const calculateTimeRemaining = () => {
      if (!votingPeriod || !votingPeriod.end_date) return;

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

      // get real weekly pool total from donations table
      const { data: poolData, error: poolError } = await supabase
        .from('user_donations')
        .select('amount')
        .eq('voting_period_id', period.id);

      if (!poolError && poolData) {
        const total = poolData.reduce((sum, row) => sum + row.amount, 0);
        setWeeklyPool(total);
      }
    } catch (err) {
      console.error('Error loading voting period:', err);
      setError('Failed to load voting period. Please try again later.');
    } finally {
      setLoading(false);
    }
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

        // call Edge Function to create a PayPal order
        const { data: sessionData, error: sessionError } = await supabase.functions.invoke('create-paypal-order', {
          body: { amount: amount.toFixed(2), userId: user?.id },
        });

        console.log('Create PayPal Order Response:', { sessionData, sessionError });

        if (sessionError) {
          let errorMessage = 'Could not create PayPal order';
          if (sessionError instanceof FunctionsHttpError) {
            try {
              const errorData = await sessionError.context.json();
              console.log('FunctionsHttpError data:', errorData);
              errorMessage = errorData.error || errorMessage;
            } catch (e) {
              console.error('Failed to parse FunctionsHttpError response:', e);
              errorMessage = sessionError.message || errorMessage;
            }
          } else {
            console.error('Non-FunctionsHttpError:', sessionError);
            errorMessage = sessionError?.message || errorMessage;
          }
          throw new Error(errorMessage);
        }

        if (!sessionData?.approvalUrl) {
          console.error('No approval URL in response:', sessionData);
          throw new Error('Could not create PayPal order');
        }

        //open PayPal checkout in the browser
        const result = await WebBrowser.openAuthSessionAsync(
          sessionData.approvalUrl,
          'charityfund://donate/success'
        );

        // if user completed payment, capture it
        if (result.type === 'success') {
          const { data: captureData, error: captureError } = await supabase.functions.invoke('capture-paypal-order', {
            body: { orderId: sessionData.orderId },
          });

          console.log('Capture PayPal Order Response:', { captureData, captureError });

          if (captureError) {
            let errorMessage = 'Payment capture failed';
            if (captureError instanceof FunctionsHttpError) {
              try {
                const errorData = await captureError.context.json();
                console.log('FunctionsHttpError data:', errorData);
                errorMessage = errorData.error || errorMessage;
              } catch (e) {
                console.error('Failed to parse FunctionsHttpError response:', e);
                errorMessage = captureError.message || errorMessage;
              }
            } else {
              console.error('Non-FunctionsHttpError:', captureError);
              errorMessage = captureError?.message || errorMessage;
            }
            throw new Error(errorMessage);
          }

          if (!captureData?.success) {
            throw new Error('Payment was not completed');
          }

          // update local state to reflect new donation
          setWeeklyPool(prev => prev + amount);
          setUserDonationAmount(prev => prev + amount);
          setDonationAmount('');

          Alert.alert(
            'Thank You! 🎉',
            `Your donation of $${amount.toFixed(2)} has been added to this week's pool!`,
            [{ text: 'OK' }]
          );
        } else if (result.type === 'cancel') {
          Alert.alert('Donation Cancelled', 'Your donation was not completed.');
        }

      } catch (err) {
        console.error('Donation error:', err);
        Alert.alert('Something went wrong', err.message || 'Please try again.');
      } finally {
        setDonating(false);
      }
    });
  };

  return (
    <View style={styles.container}>

      {/* Weekly Pool Display */}
      <View style={styles.poolContainer}>
        <Text style={styles.poolLabel}>This Week's Donation Pool</Text>
        <Text style={styles.poolAmount}>${weeklyPool.toFixed(2)}</Text>
        <Text style={styles.poolSubtext}>Will go to this week's winning charity</Text>
        {timeRemaining ? <Text style={styles.poolSubtext}>{timeRemaining}</Text> : null}
        <Text style={styles.poolUserDonationAmount}>
          {userDonationAmount > 0 ? `You have donated $${userDonationAmount.toFixed(2)} this week!` : null}
        </Text>
      </View>

      {/* Direct Donation Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Donate Directly</Text>
        <Text style={styles.sectionDescription}>
          Make a direct contribution from your own pocket
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={donationAmount}
            onChangeText={setDonationAmount}
            editable={!donating}
          />
        </View>

        <TouchableOpacity
          style={[styles.donateButton, donating && styles.donateButtonDisabled]}
          onPress={handleDirectDonate}
          disabled={donating}
        >
          <Text style={styles.donateButtonText}>
            {donating ? 'Processing...' : 'Donate with PayPal'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  poolContainer: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    paddingVertical: spacing.xl,
  },
  poolLabel: {
    color: colors.white,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semiBold,
    marginBottom: spacing.xs,
  },
  poolAmount: {
    color: colors.white,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.xs,
  },
  poolSubtext: {
    color: colors.white,
    fontSize: typography.sizes.sm,
  },
  poolUserAmount: {
    color: colors.white,
    fontSize: typography.sizes.sm,
    marginTop: spacing.sm,
  },
  poolUserDonationAmount: {
    color: colors.white,
    fontSize: typography.sizes.sm,
    marginTop: spacing.xs,
  },
  section: {
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.sm,
  },
  sectionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textLight,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.cardBackground,
  },
  dollarSign: {
    fontSize: 24,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginRight: 5,
  },
  input: {
    flex: 1,
    fontSize: 24,
    paddingVertical: 15,
  },
  donateButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  donateButtonDisabled: {
    opacity: 0.6,
  },
  donateButtonText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
});