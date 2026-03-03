import { colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { HeaderTitle } from '@react-navigation/elements';
import { Link, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/authContext';
import { supabase } from '../../services/supabase';

// Type definition for profile data
interface Donation {
  id: number;
  charity: string;
  amount: number;
  date: string;
}

interface ProfileData {
  name: string;
  email: string;
  number: string;
  avatar: string;
  totalAdsWatched: number;
  totalAdsRevenue: number;
  totalDonated: number;
  charitiesVoted: number;
  recentDonations: Donation[];
}

// Mock data (will be replaced by API call)
const mockProfile: ProfileData = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  number: '123-456-7890',
  avatar: 'https://randomuser.me/api/portraits/men/16.jpg',
  totalAdsWatched: 10,
  totalAdsRevenue: 25.00,
  totalDonated: 127.50,
  charitiesVoted: 5,
  recentDonations: [
    { id: 1, charity: 'Save the Children', amount: 25.00, date: '2024-06-01' },
    { id: 2, charity: 'World Wildlife Fund', amount: 50.00, date: '2024-05-15' },
    { id: 3, charity: 'Doctors Without Borders', amount: 20.00, date: '2024-04-30' },
    { id: 4, charity: 'Feeding America', amount: 32.50, date: '2024-04-10' },
    { id: 5, charity: 'Red Cross', amount: 100.00, date: '2024-03-25' },
  ],
};

export default function ProfileScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile data from backend
  useEffect(() => {
    if (session) {
      fetchProfileData();
    } else {
      setLoading(false); // Stop loading immediately if not logged in
    }
  }, [session]);

 const fetchProfileData = async () => {
  try {
    setLoading(true);
    setError(null);

    // Get current user from session
    if (!session?.user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    // Fetch profile data from Supabase
    // (Once you create a profiles table, this will work)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      throw error;
    }

    // Map Supabase data to your ProfileData format
    setProfile({
      name: data.name || 'User',
      email: session.user.email || '',
      number: data.phone || 'Not provided',
      avatar: data.avatar_url || 'https://randomuser.me/api/portraits/men/16.jpg',
      totalAdsWatched: data.total_ads_watched || 0,
      totalAdsRevenue: data.total_ads_revenue || 0,
      totalDonated: data.total_donated || 0,
      charitiesVoted: data.charities_voted || 0,
      recentDonations: [], // We'll fetch this from another table later
    });

  } catch (err) {
    console.error('Error fetching profile:', err);
    // DON'T fall back to mock data - just leave profile as null
    setError('Unable to load profile data');
  } finally {
    setLoading(false);
  }
};

  if (!session) {
    return (
      <View style={styles.container}>
        <View style={styles.headerBar}>
          <HeaderTitle style={styles.headerTitle}>My Profile</HeaderTitle>
          <View style={styles.placeholder}/>
        </View>
        
        <View style={[styles.centerContent, { flex: 1 }]}>
          <Ionicons name="person-circle-outline" size={100} color={colors.textSecondary} />
          <Text style={styles.notLoggedInTitle}>Not Logged In</Text>
          <Text style={styles.notLoggedInSubtitle}>
            Create an account to track your impact and voting history
          </Text>
          
          <TouchableOpacity 
            style={styles.loginButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.signupButton}
            onPress={() => router.push('/(auth)/signup')}
          >
            <Text style={styles.signupButtonText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  // Error state
  if (error || !profile) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error || 'Profile not found'}</Text>
        <TouchableOpacity onPress={fetchProfileData} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <HeaderTitle style={styles.headerTitle}>My Profile</HeaderTitle>
        <View style={styles.placeholder}/>
        <Link href="/settings" asChild>
          <TouchableOpacity style={styles.settingsButton}>
            <Ionicons name="settings-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
      </View>

      <ScrollView style={styles.scrollContent}>
        <View style={styles.profilePhotoContainer}>
          <Image 
            source={{ uri: profile.avatar }} 
            style={styles.profilePhoto}
          />
        </View>

        <View style={styles.profileDivider} />

        <View style={styles.infoSection}>
          <View style={styles.infoRow}> 
            <Text style={styles.infolabel}>Username</Text>
            <Text style={styles.infoValue}>{profile.name}</Text>
          </View>
          <View style={styles.infoBorder} />

          <View style={styles.infoRow}>
            <Text style={styles.infolabel}>Email</Text>
            <Text style={styles.infoValue}>{profile.email}</Text>
          </View>
          <View style={styles.infoBorder} />

          <View style={styles.infoRow}>
            <Text style={styles.infolabel}>Phone Number</Text>
            <Text style={styles.infoValue}>{profile.number}</Text>
          </View>
          <View style={styles.infoBorder} />
        </View>

        <View style={styles.stats}>
          <Text style={styles.statsSectionTitle}>Your Impact</Text>
          <View style={styles.divider} />
          <Text style={styles.stat}>Ads Watched: {profile.totalAdsWatched}</Text>
          <Text style={styles.stat}>Ad Revenue Raised: ${profile.totalAdsRevenue.toFixed(2)}</Text>
          <Text style={styles.stat}>Total Donated: ${profile.totalDonated.toFixed(2)}</Text>
          <Text style={styles.stat}>Total Votes Cast: {profile.charitiesVoted}</Text>
        </View>

        <View style={styles.recentDonationsContainer}>
          <Text style={styles.donationsSectionTitle}>Recent Donations</Text>
          <View style={styles.divider} />
          {profile.recentDonations.length > 0 ? (
            <ScrollView 
              style={styles.recentDonations}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
            >
              {profile.recentDonations.map(donation => (
                <View key={donation.id} style={styles.donationItem}>
                  <Text style={styles.donationCharity}>{donation.charity}</Text>
                  <Text style={styles.donationAmount}>${donation.amount.toFixed(2)}</Text>
                  <Text style={styles.donationDate}>{donation.date}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>No donations yet</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.error,
    marginBottom: spacing.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: spacing.sm,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  emptyText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerTitle:{
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
    paddingTop: spacing.xl,
  },
  placeholder: {
    width: 24,
  },
  settingsButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  profilePhotoContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  profilePhoto: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  profileDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
    marginBottom: -spacing.xl,
  },
  infoSection: {
    marginBottom: spacing.xxl,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },  
  infolabel: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.xl,
    width: 150, 
  },
  infoValue: {
    flex: 1,
    fontSize: typography.sizes.lg,
    textAlign: 'left',
    marginTop: spacing.xl,
    color: colors.text,
  },
  infoBorder: {
    height: 1,
    marginVertical: -spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginLeft: 150,
  },
  divider:{
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  statsSectionTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  stats: {
    marginBottom: spacing.xl,
  },
  donationsSectionTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  stat: {
    fontSize: typography.sizes.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  recentDonations: {
    maxHeight: 240,
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    borderRadius: spacing.sm,
    marginBottom: spacing.xl,
  },
  recentDonationsContainer: {
    marginBottom: spacing.xxl,
  },
  donationItem: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  donationCharity: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  donationAmount: {
    fontSize: typography.sizes.md,
    color: colors.success,
  },
  donationDate: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  notLoggedInTitle: {
  fontSize: typography.sizes.xxl,
  fontWeight: typography.weights.bold,
  color: colors.text,
  marginTop: spacing.lg,
  marginBottom: spacing.sm,
},
notLoggedInSubtitle: {
  fontSize: typography.sizes.md,
  color: colors.textSecondary,
  textAlign: 'center',
  paddingHorizontal: spacing.xl,
  marginBottom: spacing.xl,
},
loginButton: {
  backgroundColor: colors.primary,
  paddingHorizontal: spacing.xxl,
  paddingVertical: spacing.md,
  borderRadius: spacing.sm,
  marginBottom: spacing.md,
  width: '80%',
  alignItems: 'center',
},
loginButtonText: {
  color: colors.white,
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.bold,
},
signupButton: {
  backgroundColor: colors.white,
  paddingHorizontal: spacing.xxl,
  paddingVertical: spacing.md,
  borderRadius: spacing.sm,
  borderWidth: 2,
  borderColor: colors.primary,
  width: '80%',
  alignItems: 'center',
},
signupButtonText: {
  color: colors.primary,
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.bold,
},
});