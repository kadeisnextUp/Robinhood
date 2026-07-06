import CardSwap, { Card } from '@/src/components/CardSwap';
import ReceiptCard from '@/src/components/ReceiptCard';
import RetryState from '@/src/components/RetryState';
import { colors, spacing } from '@/src/theme';
import { useFocusEffect } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';

export default function DonationReceiptsScreen() {
  const posthog = usePostHog();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // available vertical space: subtract paddingTop, header, footer, safe area bottom, tab bar
  const CARD_AREA_HEIGHT = SCREEN_HEIGHT - 60 - 160 - insets.bottom - 49;
  const CARD_HEIGHT = Math.min(500, Math.max(340, CARD_AREA_HEIGHT));

  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReceipts();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReceipts();
    }, [])
  );

  const loadReceipts = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Sign in to view donation receipts.');
        return;
      }

      // get all closed donations with charity info and period info
      const { data: donations, error: donationsError } = await supabase
        .from('donations')
        .select(`
          id,
          amount,
          donated_at,
          transaction_id,
          proof_url,
          voting_period_id,
          charity_id,
          charities (
            name
          )
        `)
        .order('donated_at', { ascending: false });

      if (donationsError) throw donationsError;

      // for each donation, get vote counts for the winning charity
      const receiptsWithVotes = await Promise.all(
        donations.map(async (donation) => {

          // total votes in that period
          const { count: totalVotes } = await supabase
            .from('votes')
            .select('id', { count: 'exact', head: true })
            .eq('voting_period_id', donation.voting_period_id);

          // votes for the winning charity specifically
          const { count: winnerVotes } = await supabase
            .from('votes')
            .select('id', { count: 'exact', head: true })
            .eq('voting_period_id', donation.voting_period_id)
            .eq('charity_id', donation.charity_id);

          // calculate winner's vote share percentage
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
            transactionId: donation.transaction_id || 'N/A',
            proofUrl: donation.proof_url || null,
          };
        })
      );

      setReceipts(receiptsWithVotes);
      posthog.capture('receipts_viewed', { receipt_count: receiptsWithVotes.length });
    } catch (err) {
      console.error('Error loading receipts:', err);
      setError('Failed to load donation receipts.');
    } finally {
      setLoading(false);
    }
  };

  const lastTap = useRef<{ index: number; time: number } | null>(null);

  const handleCardClick = (index: number) => {
    const now = Date.now();
    if (lastTap.current?.index === index && now - lastTap.current.time < 300) {
      lastTap.current = null;
      const receipt = receipts[index];
      if (receipt?.transactionId && receipt.transactionId !== 'N/A') {
        Linking.openURL(`https://www.paypal.com/activity/payment/${receipt.transactionId}`);
      }
    } else {
      lastTap.current = { index, time: now };
    }
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
    const isSignedOut = error === 'Sign in to view donation receipts.';
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <RetryState
          tone="light"
          icon={isSignedOut ? 'log-in-outline' : 'cloud-offline-outline'}
          title={isSignedOut ? 'Sign in required' : "Couldn't load receipts"}
          message={isSignedOut ? error : 'Check your connection and try again.'}
          onRetry={loadReceipts}
        />
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
          Double-tap a card to view the PayPal receipt or swipe to browse the history of Fund-It
        </Text>
      </View>

      <View style={[styles.cardSwapWrapper, { height: CARD_AREA_HEIGHT }]}>
        <CardSwap
          width={SCREEN_WIDTH}
          height={CARD_HEIGHT}
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

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: 'bold',
    color: colors.secondary,
    marginBottom: 8,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    fontFamily: 'Fredoka_400Regular',
    color: colors.white,
    textAlign: 'center',
    marginBottom: 16,
  },
  cardSwapWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});