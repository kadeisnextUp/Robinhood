import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { HeaderTitle } from '@react-navigation/elements';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/authContext';
import { supabase } from '../../services/supabase';
import { isProfane } from '../../src/utils/profanity';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const COOLDOWN_DAYS = 5;

interface Nomination {
  id: string;
  charityName: string;
  ein: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
}

interface Profile {
  isAdmin: boolean;
  username: string;
  usernameUpdatedAt: string | null;
  name: string;
  email: string;
  number: string;
  avatar: string;
  totalDonated: number;
  charitiesVoted: number;
  recentDonations: Array<{ id: string; charity: string; amount: number; date: string }>;
  nominations: Nomination[];
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // username editing
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const usernameInputRef = useRef<TextInput>(null);

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
        .select('name, phone, avatar_url, is_admin, username, username_updated_at')
        .eq('user_id', userId)
        .single();

      // if no profile row exists yet, create one with username from signup metadata
      if (profileError && profileError.code === 'PGRST116') {
        const metaUsername = session.user.user_metadata?.username as string | undefined;
        await supabase.from('profiles').insert({
          user_id: userId,
          username: metaUsername ?? `user_${userId.slice(0, 8)}`,
        });
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

      // fetch user's nominations with charity name and EIN
      const { data: nominationData, error: nomError } = await supabase
        .from('nominations')
        .select(`
          id,
          status,
          created_at,
          charities (
            name,
            ein
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });


      setProfile({
        isAdmin: profileData?.is_admin ?? false,
        username: profileData?.username || `user_${userId.slice(0, 8)}`,
        usernameUpdatedAt: profileData?.username_updated_at ?? null,
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
        nominations: nominationData?.map((n) => ({
          id: n.id,
          charityName: n.charities?.name ?? 'Unknown',
          ein: n.charities?.ein ?? '',
          status: n.status,
          date: new Date(n.created_at).toLocaleDateString('en-US', {
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

  const handleUsernameUpdate = async () => {
    if (!session || !profile) return;

    const trimmed = newUsername.trim().toLowerCase();

    // Cooldown check
    if (profile.usernameUpdatedAt) {
      const diffDays = (Date.now() - new Date(profile.usernameUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < COOLDOWN_DAYS) {
        const daysLeft = Math.ceil(COOLDOWN_DAYS - diffDays);
        Alert.alert('Cooldown', `You can change your username again in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`);
        return;
      }
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      Alert.alert('Error', 'Username must be 3–20 characters and can only contain letters, numbers, underscores, and hyphens');
      return;
    }

    if (isProfane(trimmed)) {
      Alert.alert('Error', 'That username is not allowed');
      return;
    }

    if (trimmed === profile.username) {
      setIsEditingUsername(false);
      return;
    }

    setUsernameLoading(true);
    try {
      const { data: existing } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', trimmed)
        .maybeSingle();

      if (existing) {
        Alert.alert('Error', 'That username is already taken');
        return;
      }

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('profiles')
        .update({ username: trimmed, username_updated_at: now })
        .eq('user_id', session.user.id);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setProfile({ ...profile, username: trimmed, usernameUpdatedAt: now });
      setIsEditingUsername(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update username.');
    } finally {
      setUsernameLoading(false);
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
            {isEditingUsername ? (
              <View style={styles.usernameEditContainer}>
                <TextInput
                  ref={usernameInputRef}
                  style={styles.usernameInput}
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleUsernameUpdate}
                />
                {usernameLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: spacing.sm }} />
                ) : (
                  <>
                    <TouchableOpacity onPress={handleUsernameUpdate} style={styles.usernameAction}>
                      <Ionicons name="checkmark" size={20} color={colors.success} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setIsEditingUsername(false)} style={styles.usernameAction}>
                      <Ionicons name="close" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <View style={styles.usernameDisplayContainer}>
                <Text style={styles.infoValue}>@{profile.username}</Text>
                <TouchableOpacity
                  onPress={() => { setNewUsername(profile.username); setIsEditingUsername(true); }}
                  style={styles.usernameAction}
                >
                  <Ionicons name="pencil" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}
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

        <View style={styles.recentDonationsContainer}>
          <Text style={styles.donationsSectionTitle}>My Nominations</Text>
          <View style={styles.divider} />
          {profile.nominations.length > 0 ? (
            <ScrollView
              style={styles.recentDonations}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
            >
              {profile.nominations.map((nom) => {
                const statusEmoji = nom.status === 'approved' ? '✅' : nom.status === 'rejected' ? '❌' : '⏳';
                return (
                  <View key={nom.id} style={styles.donationItem}>
                    <Text style={styles.donationCharity}>{nom.charityName}</Text>
                    {nom.ein ? <Text style={styles.donationDate}>EIN: {nom.ein}</Text> : null}
                    <View style={styles.nominationRow}>
                      <Text style={styles.donationDate}>{nom.date}</Text>
                      <View style={styles.statusColumn}>
                        <Text style={styles.nominationEmoji}>{statusEmoji}</Text>
                        <View style={[
                          styles.statusBadge,
                          nom.status === 'approved' && styles.statusApproved,
                          nom.status === 'rejected' && styles.statusRejected,
                          nom.status === 'pending' && styles.statusPending,
                        ]}>
                          <Text style={styles.statusText}>
                            {nom.status.charAt(0).toUpperCase() + nom.status.slice(1)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>No nominations yet</Text>
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
  usernameDisplayContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  usernameEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  usernameInput: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.xs,
    textAlign: 'right',
  },
  usernameAction: {
    padding: spacing.xs,
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
  nominationEmoji: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 2,
  },
  statusColumn: {
    alignItems: 'center',
  },
  nominationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusApproved: {
    backgroundColor: colors.success,
  },
  statusRejected: {
    backgroundColor: colors.error,
  },
  statusPending: {
    backgroundColor: colors.textSecondary,
  },
  statusText: {
    color: colors.white,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semiBold,
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
  marginTop: spacing.lg,
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