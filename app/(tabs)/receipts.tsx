import CardSwap, { Card } from '@/src/components/CardSwap';
import ReceiptCard from '@/src/components/ReceiptCard';
import { colors, spacing } from '@/src/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../services/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DonationReceiptsScreen() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReceipts();
  }, []);

  const loadReceipts = async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Get all closed donations with charity info and period info
      const { data: donations, error: donationsError } = await supabase
        .from('donations')
        .select(`
          id,
          amount,
          donated_at,
          transaction_id,
          proof_url,
          voting_period_id,
          charities (
            name
          )
        `)
        .order('donated_at', { ascending: false });

      if (donationsError) throw donationsError;

      // Step 2: For each donation, get vote counts for the winning charity
      const receiptsWithVotes = await Promise.all(
        donations.map(async (donation) => {

          // Get total votes in that period
          const { count: totalVotes } = await supabase
            .from('votes')
            .select('id', { count: 'exact', head: true })
            .eq('voting_period_id', donation.voting_period_id);

          // Get votes for the winning charity specifically
          const { count: winnerVotes } = await supabase
            .from('votes')
            .select('id', { count: 'exact', head: true })
            .eq('voting_period_id', donation.voting_period_id)
            .eq('charity_id', donation.charities.id);

          // Calculate winner's vote share percentage
          const percentage = totalVotes > 0
            ? Math.round((winnerVotes / totalVotes) * 100)
            : 0;

          return {
            id: donation.id,
            charityName: donation.charities.name,
            amount: donation.amount,
            date: new Date(donation.donated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
            votes: winnerVotes ?? 0,
            percentage,
            transactionId: donation.transaction_id || donation.proof_url || 'N/A',
          };
        })
      );

      setReceipts(receiptsWithVotes);

    } catch (err) {
      console.error('Error loading receipts:', err);
      setError('Failed to load donation receipts.');
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (index: number) => {
    console.log(`Clicked on receipt ${index}`);
  };

  if (loading) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.white} />
        <Text style={{ color: colors.white, marginTop: spacing.md }}>
          Loading receipts...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.white }}>{error}</Text>
        <Text
          style={{ color: colors.secondary, marginTop: spacing.md }}
          onPress={loadReceipts}
        >
          Tap to retry
        </Text>
      </View>
    );
  }

  if (receipts.length === 0) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.white, fontSize: 18, textAlign: 'center', paddingHorizontal: spacing.xl }}>
          No donations yet — check back after the first voting period closes!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Past Donations</Text>
        <Text style={styles.subtitle}>
          Swipe left and view each receipt to go through our donation history
        </Text>
      </View>

      <View style={styles.cardSwapWrapper}>
        <CardSwap
          width={SCREEN_WIDTH}
          height={580}
          cardDistance={30}
          verticalDistance={30}
          easing="elastic"
          onCardClick={handleCardClick}
        >
          {receipts.map((receipt) => (
            <Card key={receipt.id}>
              <ReceiptCard
                charityName={receipt.charityName}
                amount={receipt.amount}
                date={receipt.date}
                votes={receipt.votes}
                percentage={receipt.percentage}
                transactionId={receipt.transactionId}
              />
            </Card>
          ))}
        </CardSwap>
      </View>

      <View style={styles.footer}>
        <View style={styles.swipeIndicator}>
          <Text style={styles.swipeArrow}>←</Text>
          <Text style={styles.swipeText}>Swipe</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.secondary,
    marginBottom: 8,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    color: colors.white,
    textAlign: 'center',
    marginBottom: -20,
  },
  cardSwapWrapper: {
    height: 800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    height: 90,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  swipeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swipeArrow: {
    fontSize: 50,
    color: colors.success,
    marginBottom: -60,
  },
  swipeText: {
    fontSize: 22,
    color: colors.secondary,
  },
});