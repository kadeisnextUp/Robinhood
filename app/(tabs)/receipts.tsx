import CardSwap, { Card } from '@/src/components/CardSwap';
import ReceiptCard from '@/src/components/ReceiptCard';
import { colors, spacing } from '@/src/theme';
import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Example donation receipt data
const mockReceipts = [
  {
    id: 1,
    charityName: 'Clean Water Initiative',
    amount: 5000,
    date: '2024-02-05',
    votes: 1247,
    percentage: 45,
    transactionId: 'TXN-2024-001-ABC',
  },
  {
    id: 2,
    charityName: 'Children Education Fund',
    amount: 3500,
    date: '2024-01-29',
    votes: 892,
    percentage: 38,
    transactionId: 'TXN-2024-002-DEF',
  },
  {
    id: 3,
    charityName: 'Animal Rescue League',
    amount: 4200,
    date: '2024-01-22',
    votes: 1034,
    percentage: 41,
    transactionId: 'TXN-2024-003-GHI',
  },
  {
    id: 4,
    charityName: 'Food Bank Network',
    amount: 6100,
    date: '2024-01-15',
    votes: 1523,
    percentage: 52,
    transactionId: 'TXN-2024-004-JKL',
  },
];

const DonationReceiptsScreen = () => {
  const handleCardClick = (index: number) => {
    console.log(`Clicked on receipt ${index}`);
    // Options when user taps a receipt:
    // 1. Navigate to full-screen view
    // 2. Show share options (social media, download PDF)
    // 3. Show donation impact details
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Past Donations</Text>
        <Text style={styles.subtitle}>Swipe left and view each reciept to go through our donation history</Text>
        <Text style={styles.swipeArrow}>←</Text>
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
          {mockReceipts.map((receipt) => (
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
};

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
    marginTop:spacing.sm,
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

export default DonationReceiptsScreen;
