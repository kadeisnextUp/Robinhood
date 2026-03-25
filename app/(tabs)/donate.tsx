import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRequireAuth } from '../../hooks/useRequiredAuth';




export default function DonateScreen() {
    // component state for donation amount, user donation amount, weekly pool, and donation timer
  const [donationAmount, setDonationAmount] = useState('');
  const [userDonationAmount, setUserDonationAmount] = useState(0); 
  const [weeklyPool, setWeeklyPool] = useState(127.50); // Fake data for now
  const [votingPeriod, setVotingPeriod] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // auth check for donation actions
  const { requireAuth } = useRequireAuth();

  useEffect(() => {
    loadResults();
  }, []);

// calculate time remaining until Saturday 11:55 PM
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
    } catch (err) {
      console.error('Error loading voting period:', err);
      setError('Failed to load voting period. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
   
  const handleDirectDonate = () => {
    const amount = parseFloat(donationAmount);
    
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid donation amount.');
      return;
    }

    // This will integrate with Stripe later
    requireAuth(() => {
      Alert.alert(
        'Thank You!',
        `Your donation of $${amount.toFixed(2)} has been added to this week's pool!`,
        [{ text: 'OK', onPress: () => {
          setWeeklyPool(prev => prev + amount);
          setDonationAmount('');
          setUserDonationAmount(prev => prev + amount);
       }}]
      );
    });
  };

  return (
    <View style={styles.container}>
      
      {/* Weekly Pool Display */}
      <View style={styles.poolContainer}>
        <Text style={styles.poolLabel}>This Week's Donation Pool</Text>
        <Text style={styles.poolAmount}>${weeklyPool.toFixed(2)}</Text>
        <Text style={styles.poolSubtext}>Will go to this week's winning charity</Text>
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
          />
        </View>

        <TouchableOpacity 
          style={styles.donateButton}
          onPress={handleDirectDonate}
        >
          <Text style={styles.donateButtonText}>Donate Now</Text>
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
    alignItems: 'left',
    marginBottom: spacing.lg,
    paddingVertical: spacing.xl,
  },
  poolLabel: {
    color: colors.white,
    fontSize: typography.sizes.xl,
    alignItems: 'left',
    fontWeight: typography.weights.semiBold,
    marginBottom: spacing.xs,
  },
  poolAmount: {
    color: colors.white,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    alignContent: 'right',
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
    alignItems: 'flex-end',
  },   
    poolUserDonationAmount: {
    color: colors.white,
    fontSize: typography.sizes.sm,
    marginTop: spacing.xs,
    alignItems: 'flex-end',
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
  donateButtonText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
});