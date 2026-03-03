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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>GIVE</Text>
        <View style={styles.checkmarkCircle}>
          <Text style={styles.checkmark}>✓</Text>
        </View>
        <Text style={styles.confirmed}>DONATION CONFIRMED</Text>
      </View>

      {/* Divider */}
      <View style={styles.dottedLine} />

      {/* Main Content */}
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

      {/* Footer Details */}
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
          <Text style={styles.detailValue}>Pooled Funds</Text>
        </View>
      </View>

      {/* Bottom Banner */}
      <View style={styles.bottomBanner}>
        <Text style={styles.bannerText}>
          Thank you for making a difference! 💚
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  receipt: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#4ade80',
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  appName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    letterSpacing: spacing.xs,
  },
  checkmarkCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  checkmark: {
    fontSize: 36,
    color: colors.success,
    fontWeight: 'bold',
  },
  confirmed: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
    letterSpacing: 1.5,
  },
  dottedLine: {
    height: 2,
    backgroundColor: '#e5e5e5',
    marginVertical: 0,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#d1d1d1',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    color: '#888',
    letterSpacing: 1,
    marginBottom: 8,
  },
  charityName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
    marginBottom: 24,
  },
  amountBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  amountLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  amount: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#4ade80',
  },
  statsGrid: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e5e5e5',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#fafafa',
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#111',
    fontWeight: '600',
  },
  detailValueMono: {
    fontSize: 11,
    color: '#111',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  bottomBanner: {
    backgroundColor: '#4ade80',
    paddingVertical: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ReceiptCard;
