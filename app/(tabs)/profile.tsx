import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { HeaderTitle } from '@react-navigation/elements';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/authContext';
import { supabase } from '../../services/supabase';

interface Profile {
  isAdmin: boolean;
  name: string;
  email: string;
  number: string;
  avatar: string;
  totalDonated: number;
  charitiesVoted: number;
  recentDonations: Array<{ id: string; charity: string; amount: number; date: string }>;
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      fetchProfileData();
    } else {
      setLoading(false);
    }
  }, [session]);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      setError(null);

      const userId = session.user.id;

      // get profile info
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('name, phone, avatar_url, is_admin')
        .eq('user_id', userId)
        .single();

      // if no profile row exists yet, create one
      if (profileError && profileError.code === 'PGRST116') {
        await supabase.from('profiles').insert({ user_id: userId });
      } else if (profileError) {
        throw profileError;
      }

      // count total votes cast by this user
      const { count: totalVotes } = await supabase
        .from('votes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

  
      // count total personal donations by this user
      const { data: donationData } = await supabase
        .from('user_donations')
        .select('amount')
        .eq('user_id', userId);

      const totalDonated = donationData
        ?.reduce((sum, row) => sum + row.amount, 0) ?? 0;

      // count recent personal donations with charity names
      const { data: recentDonations } = await supabase
        .from('user_donations')
        .select(`
          id,
          amount,
          donated_at,
          charities (
            name
          )
        `)
        .eq('user_id', userId)
        .order('donated_at', { ascending: false })
        .limit(5);

      setProfile({
        isAdmin: profileData?.is_admin ?? false,
        name: profileData?.name || 'User',
        email: session.user.email || '',
        number: profileData?.phone || 'Not provided',
        avatar: profileData?.avatar_url || 'https://www.gravatar.com/avatar/?d=mp&s=140',
        totalDonated: totalDonated,
        charitiesVoted: totalVotes ?? 0,
        recentDonations: recentDonations?.map((d) => ({
          id: d.id,
          charity: d.charities.name,
          amount: d.amount,
          date: new Date(d.donated_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        })) ?? [],
      });

    } catch (err) {
      console.error('Error fetching profile:', err);
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
          <View style={styles.placeholder} />
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

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
        <View style={styles.placeholder} />
        {/* Only visible to admins */}
        {profile?.isAdmin && (
          <TouchableOpacity
            style={styles.adminButton}
            onPress={() => router.push('/admin')}
          >
            <Text style={styles.adminButtonText}>Admin Panel</Text>
          </TouchableOpacity>
        )}
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
              {profile.recentDonations.map((donation) => (
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
  headerTitle: {
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
  divider: {
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
  adminButton: {
  backgroundColor: colors.cardBackground,
  padding: spacing.sm,
  borderRadius: borderRadius.md,
  alignItems: 'center',
  marginHorizontal: spacing.sm,
  marginBottom: spacing.xxl,
  borderWidth: 1,
  borderColor: colors.border,
},
adminButtonText: {
  color: colors.secondary,
  fontSize: typography.sizes.sm,
},
});