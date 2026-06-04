import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing } from '../theme';

interface ReceiptCardProps {
  charityName: string;
  charityLogo?: string;
  amount: number;
  date: string;
  votes: number;
  percentage: number;
  transactionId: string;
}

/**
 *  renders a receipt card that can be:
 * 1. displayed directly in the Card component
 * 2. captured as an image using react-native-view-shot (for sharing/downloading)
 */
const ReceiptCard: React.FC<ReceiptCardProps> = ({
  charityName,
  amount,
  date,
  votes,
  percentage,
  transactionId,
}) => {
  return (
    <View style={styles.receipt}>
      {/* header */}
      <View style={styles.header}>
        <Text style={styles.appName}>GIVE</Text>
        <View style={styles.checkmarkCircle}>
          <Text style={styles.checkmark}>✓</Text>
        </View>
        <Text style={styles.confirmed}>DONATION CONFIRMED</Text>
      </View>

      {/* divider */}
      <View style={styles.dottedLine} />

      {/* main Content */}
      <View style={styles.content}>
        <Text style={styles.label}>DONATED TO</Text>
        <Text style={styles.charityName}>{charityName}</Text>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Total Amount</Text>
          <Text style={styles.amount}>${amount.toLocaleString()}</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{votes.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total Votes</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{percentage}%</Text>
            <Text style={styles.statLabel}>Vote Share</Text>
          </View>
        </View>
      </View>

      {/* footer Details */}
      <View style={styles.footer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>{date}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Transaction ID</Text>
          <Text style={styles.detailValueMono}>{transactionId}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Payment Method</Text>
          <Text style={styles.detailValue}>PayPal</Text>
        </View>
      </View>

      {/* bottom Banner */}
      <View style={styles.bottomBanner}>
        <Text style={styles.bannerText}>
          Thank you for making a difference! 
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  receipt: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  appName: {
    fontSize: 14,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: '700',
    color: colors.white,
    marginBottom: 10,
    letterSpacing: spacing.xs,
  },
  checkmarkCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkmark: {
    fontSize: 26,
    fontFamily: 'Fredoka_700Bold',
    color: colors.primary,
    fontWeight: 'bold',
  },
  confirmed: {
    fontSize: 11,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: '600',
    color: colors.primaryLight,
    letterSpacing: 1.5,
  },
  dottedLine: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: {
    padding: 14,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    letterSpacing: 1,
    marginBottom: 4,
  },
  charityName: {
    fontSize: 20,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  amountBox: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountLabel: {
    fontSize: 11,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    marginBottom: 2,
  },
  amount: {
    fontSize: 34,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: 'bold',
    color: colors.primary,
  },
  statsGrid: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.divider,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'Fredoka_500Medium',
    color: colors.textLight,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.text,
    fontWeight: '600',
  },
  detailValueMono: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  bottomBanner: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 'auto',
  },
  bannerText: {
    fontSize: 13,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: '600',
    color: colors.primaryLight,
  },
});

export default ReceiptCard;
