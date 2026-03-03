import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRequireAuth } from '../../hooks/useRequiredAuth';



export default function DonateScreen() {
    // component state for donation amount, ad watched, user donation amount, and weekly pool
  const [donationAmount, setDonationAmount] = useState('');
  const [userAdWatched, setUserAdWatched] = useState(0); 
  const [userDonationAmount, setUserDonationAmount] = useState(0); 
  const [weeklyPool, setWeeklyPool] = useState(127.50); // Fake data for now

  // auth check for donation actions
   const { requireAuth } = useRequireAuth();


  const handleWatchAd = () => {
    // This will integrate with AdMob later
    // For now, just simulate watching an ad
    requireAuth(() => {
      Alert.alert(
        'Ad Watched!',
        'Thanks for watching! $0.05 has been added to this week\'s donation pool.',
        [{ text: 'OK', onPress: () => {
        // Simulate adding ad revenue to pool
          setWeeklyPool(prev => prev + 0.05);
          setUserAdWatched(prev => prev + 1);
        }}]
      );
    });
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
        <Text style={styles.poolUserAmount}>
          {userAdWatched ? `You have watched ${userAdWatched} ad(s) this week!` : null}
        </Text>
        <Text style={styles.poolUserDonationAmount}>
          {userDonationAmount > 0 ? `You have donated $${userDonationAmount.toFixed(2)} this week!` : null}
        </Text>
      </View>

      {/* Watch Ad Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Watch an Ad to Donate</Text>
        <Text style={styles.sectionDescription}>
          Watch a short video ad and we'll add the revenue to this week's donation pool at no cost to you!
        </Text>
        <TouchableOpacity 
          style={styles.adButton}
          onPress={handleWatchAd}
        >
          <Text style={styles.adButtonText}>▶ Watch Ad (~$0.05)</Text>
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
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
  adButton: {
    backgroundColor: colors.secondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  adButtonText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 15,
    color: colors.textLight,
    fontWeight: typography.weights.semiBold,
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