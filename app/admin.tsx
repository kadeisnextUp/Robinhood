import { useAuth } from '@/contexts/authContext';
import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function AdminScreen() {
  const { session } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [closedPeriods, setClosedPeriods] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Donation form state
  const [donationAmount, setDonationAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);

  useEffect(() => {
    if (session) {
      checkAdminAccess();
    } else {
      setLoading(false);
    }
  }, [session]);

  const checkAdminAccess = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', session.user.id)
        .single();

      if (error) throw error;

      setIsAdmin(data.is_admin);

      if (data.is_admin) {
        await loadPeriods();
      }
    } catch (err) {
      console.error('Admin check error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriods = async () => {
    try {
      // Get current open period
      const { data: openPeriod } = await supabase
        .from('voting_periods')
        .select(`
          id,
          start_date,
          end_date,
          is_closed,
          winner_charity_id,
          charities (name)
        `)
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      setCurrentPeriod(openPeriod);

      // Get closed periods without a donation record yet
      const { data: closed } = await supabase
        .from('voting_periods')
        .select(`
          id,
          start_date,
          end_date,
          winner_charity_id,
          charities (
            id,
            name
          )
        `)
        .eq('is_closed', true)
        .not('winner_charity_id', 'is', null)
        .order('end_date', { ascending: false });

      // Filter out periods that already have a donation recorded
      const { data: existingDonations } = await supabase
        .from('donations')
        .select('voting_period_id');

      const donatedPeriodIds = existingDonations?.map((d) => d.voting_period_id) ?? [];
      const pendingDonations = closed?.filter(
        (p) => !donatedPeriodIds.includes(p.id)
      ) ?? [];

      setClosedPeriods(pendingDonations);
    } catch (err) {
      console.error('Load periods error:', err);
    }
  };

  const handleClosePeriod = async () => {
    Alert.alert(
      'Close Voting Period',
      'Are you sure you want to close the current voting period and declare a winner?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Period',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const response = await fetch(
                'https://cmnmabsemvdzgwrjjwiw.supabase.co/functions/v1/close-voting-period',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
                  },
                  body: JSON.stringify({ force: true, period_id: currentPeriod.id }),
                }
              );

              const result = await response.json();
              console.log('Response status:', response.status);
              console.log('Response result:', JSON.stringify(result));

              if (!result.success) throw new Error(result.error);

              Alert.alert(
                'Success',
                `Voting period closed. Winner declared!`
              );
              await loadPeriods();
            } catch (err) {
              console.log('Close period error:', JSON.stringify(err));
              console.log('Close period error message:', err.message);
              console.log('Close period response status:', err.status);
              Alert.alert('Error', JSON.stringify(err) || 'Something went wrong');

            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRecordDonation = async () => {
    if (!selectedPeriodId) {
      Alert.alert('Error', 'Please select a voting period.');
      return;
    }
    if (!donationAmount || isNaN(parseFloat(donationAmount))) {
      Alert.alert('Error', 'Please enter a valid donation amount.');
      return;
    }
    if (!proofUrl) {
      Alert.alert('Error', 'Please enter a proof URL.');
      return;
    }

    const period = closedPeriods.find((p) => p.id === selectedPeriodId);

    Alert.alert(
      'Record Donation',
      `Record a $${donationAmount} donation to ${period?.charities?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record',
          onPress: async () => {
            setActionLoading(true);
            try {
              const { error } = await supabase
                .from('donations')
                .insert({
                  voting_period_id: selectedPeriodId,
                  charity_id: period.winner_charity_id,
                  amount: parseFloat(donationAmount),
                  transaction_id: transactionId || null,
                  proof_url: proofUrl,
                  donated_at: new Date().toISOString(),
                });

              if (error) throw error;

              Alert.alert('Success', 'Donation recorded successfully!');
              setDonationAmount('');
              setTransactionId('');
              setProofUrl('');
              setSelectedPeriodId(null);
              await loadPeriods();
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Block non-admins entirely
  if (!session || !isAdmin) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Access Denied</Text>
        <Text style={styles.errorSubtext}>You don't have permission to view this page.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
        <TouchableOpacity 
        style={styles.backButton}
        onPress={() => router.push('/(tabs)/profile') }
      >
        <Ionicons name="arrow-back" size={32} color={colors.secondary} />
      </TouchableOpacity>

      <Text style={styles.title}>Admin Panel</Text>

      {/* Current Voting Period */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Voting Period</Text>
        {currentPeriod ? (
          <View style={styles.card}>
            <Text style={styles.cardText}>
              {formatDate(currentPeriod.start_date)} — {formatDate(currentPeriod.end_date)}
            </Text>
            <Text style={styles.cardSubtext}>Status: Open</Text>
            <TouchableOpacity
              style={[styles.button, styles.dangerButton, actionLoading && styles.buttonDisabled]}
              onPress={handleClosePeriod}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Close Voting Period</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardSubtext}>No open voting period found.</Text>
          </View>
        )}
      </View>

      {/* Record Donation */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Record Donation</Text>
        {closedPeriods.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardSubtext}>No periods awaiting donation recording.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>Select Voting Period</Text>
            {closedPeriods.map((period) => (
              <TouchableOpacity
                key={period.id}
                style={[
                  styles.periodOption,
                  selectedPeriodId === period.id && styles.periodOptionSelected,
                ]}
                onPress={() => setSelectedPeriodId(period.id)}
              >
                <Text style={styles.periodOptionText}>
                  {formatDate(period.start_date)} — {formatDate(period.end_date)}
                </Text>
                <Text style={styles.periodWinner}>
                  Winner: {period.charities?.name ?? 'Unknown'}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.label}>Donation Amount ($)</Text>
            <TextInput
              style={styles.input}
              value={donationAmount}
              onChangeText={setDonationAmount}
              keyboardType="decimal-pad"
              placeholder="e.g. 500.00"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={styles.label}>Transaction ID (optional)</Text>
            <TextInput
              style={styles.input}
              value={transactionId}
              onChangeText={setTransactionId}
              placeholder="e.g. pi_3OqX2KJH8example"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={styles.label}>Proof URL</Text>
            <TextInput
              style={styles.input}
              value={proofUrl}
              onChangeText={setProofUrl}
              placeholder="e.g. https://drive.google.com/..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.button, styles.primaryButton, actionLoading && styles.buttonDisabled]}
              onPress={handleRecordDonation}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Record Donation</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xxl,
  },
    backButton: {
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },    

  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    fontWeight: typography.weights.semiBold,
  },
  cardSubtext: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  label: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: typography.sizes.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodOption: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  periodOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  periodOptionText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    fontWeight: typography.weights.semiBold,
  },
  periodWinner: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  button: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  dangerButton: {
    backgroundColor: colors.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semiBold,
  },
  errorText: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  errorSubtext: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
  },
});