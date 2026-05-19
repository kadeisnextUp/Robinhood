import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/authContext';
import { supabase } from '../../services/supabase';
import { isProfane } from '../../src/utils/profanity';
import { usePostHog } from 'posthog-react-native';

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

const STATUS_COLORS = {
  approved: colors.success,
  rejected: colors.error,
  pending: colors.grey,
};

export default function ProfileScreen() {
  const posthog = usePostHog();
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfileData();
    setRefreshing(false);
  };

  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const usernameInputRef = useRef<TextInput>(null);

  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused && session) {
      fetchProfileData();
    } else if (!session) {
      setLoading(false);
    }
  }, [isFocused, session]);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      setError(null);

      const userId = session.user.id;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('name, phone, avatar_url, is_admin, username, username_updated_at')
        .eq('user_id', userId)
        .single();

      if (profileError && profileError.code === 'PGRST116') {
        const metaUsername = session.user.user_metadata?.username as string | undefined;
        await supabase.from('profiles').insert({
          user_id: userId,
          username: metaUsername ?? `user_${userId.slice(0, 8)}`,
        });
      } else if (profileError) {
        throw profileError;
      }

      const { count: totalVotes } = await supabase
        .from('votes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { data: donationData } = await supabase
        .from('user_donations')
        .select('amount')
        .eq('user_id', userId);

      const totalDonated = donationData?.reduce((sum, row) => sum + row.amount, 0) ?? 0;

      const { data: recentDonations } = await supabase
        .from('user_donations')
        .select(`id, amount, donated_at, charities (name)`)
        .eq('user_id', userId)
        .order('donated_at', { ascending: false })
        .limit(5);

      const { data: nominationData } = await supabase
        .from('nominations')
        .select(`id, status, created_at, charities (name, ein)`)
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
        totalDonated,
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

    if (profile.usernameUpdatedAt) {
      const diffDays =
        (Date.now() - new Date(profile.usernameUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < COOLDOWN_DAYS) {
        const daysLeft = Math.ceil(COOLDOWN_DAYS - diffDays);
        Alert.alert(
          'Cooldown',
          `You can change your username again in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`
        );
        return;
      }
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      Alert.alert(
        'Error',
        'Username must be 3–20 characters and can only contain letters, numbers, underscores, and hyphens'
      );
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
      const { data, error: fnError } = await supabase.functions.invoke('update-username', {
        body: { username: trimmed },
      });

      if (fnError) {
        let msg = 'Could not update username.';
        try {
          const body = await (fnError as any).context?.json?.();
          msg = body?.error ?? fnError.message ?? msg;
        } catch {
          msg = fnError.message ?? msg;
        }
        Alert.alert('Error', msg);
        return;
      }

      const now = data.updatedAt ?? new Date().toISOString();
      setProfile({ ...profile, username: trimmed, usernameUpdatedAt: now });
      setIsEditingUsername(false);
      posthog.capture('username_changed');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update username.');
    } finally {
      setUsernameLoading(false);
    }
  };

  if (!session) {
    return (
      <View style={styles.container}>
        <View style={styles.banner} />
        <View style={[styles.centerContent, { flex: 1, paddingTop: spacing.xxl }]}>
          <Ionicons name="person-circle-outline" size={96} color={colors.primaryLight} />
          <Text style={styles.notLoggedInTitle}>Not Logged In</Text>
          <Text style={styles.notLoggedInSubtitle}>
            Create an account to track your impact and voting history
          </Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/(auth)/login')}>
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
        <Text style={styles.mutedText}>Loading profile...</Text>
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
      <StatusBar barStyle="light-content" />

      {/* ── Banner + avatar ── */}
      <View style={styles.banner}>
        {/* Top-right actions overlaid on banner */}
        <View style={styles.bannerActions}>
          {profile.isAdmin && (
            <TouchableOpacity style={styles.adminChip} onPress={() => router.push('/admin')}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.cardBackground} />
              <Text style={styles.adminChipText}>Admin</Text>
            </TouchableOpacity>
          )}
          <Link href="/settings" asChild>
            <TouchableOpacity style={styles.settingsBtn}>
              <Ionicons name="settings-outline" size={22} color={colors.cardBackground} />
            </TouchableOpacity>
          </Link>
        </View>
      </View>

      {/* avatar overlapping the banner */}
      <View style={styles.avatarWrapper}>
        <Image source={{ uri: profile.avatar }} style={styles.avatar} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── username ── */}
        <View style={styles.identitySection}>
          {isEditingUsername ? (
            <View style={styles.usernameEditRow}>
              <Text style={styles.atSign}>@</Text>
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
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: spacing.xs }} />
              ) : (
                <>
                  <TouchableOpacity onPress={handleUsernameUpdate} style={styles.iconBtn}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsEditingUsername(false)} style={styles.iconBtn}>
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.usernameRow}
              onPress={() => { setNewUsername(profile.username); setIsEditingUsername(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.displayName}>@{profile.username}</Text>
              <Ionicons name="pencil" size={16} color={colors.primaryLight} style={{ marginLeft: spacing.sm }} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── stats row ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.charitiesVoted}</Text>
            <Text style={styles.statLabel}>Votes Cast</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>${profile.totalDonated.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Donated</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.nominations.length}</Text>
            <Text style={styles.statLabel}>Nominations</Text>
          </View>
        </View>

        {/* ── Recent Donations ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Donations</Text>
          {profile.recentDonations.length > 0 ? (
            profile.recentDonations.map((donation) => (
              <View key={donation.id} style={styles.listCard}>
                <View style={styles.listCardLeft}>
                  <View style={styles.donationIconCircle}>
                    <Ionicons name="heart" size={16} color={colors.white} />
                  </View>
                  <View style={styles.listCardText}>
                    <Text style={styles.listCardTitle} numberOfLines={1}>{donation.charity}</Text>
                    <Text style={styles.listCardSub}>{donation.date}</Text>
                  </View>
                </View>
                <Text style={styles.donationAmount}>${donation.amount.toFixed(2)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="heart-outline" size={32} color={colors.primaryLight} />
              <Text style={styles.emptyText}>No donations yet</Text>
            </View>
          )}
        </View>

        {/* ── my Nominations ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Nominations</Text>
          {profile.nominations.length > 0 ? (
            profile.nominations.map((nom) => (
              <View key={nom.id} style={styles.listCard}>
                <View style={styles.listCardLeft}>
                  <View style={[styles.donationIconCircle, { backgroundColor: STATUS_COLORS[nom.status] }]}>
                    <Ionicons
                      name={
                        nom.status === 'approved'
                          ? 'checkmark'
                          : nom.status === 'rejected'
                          ? 'close'
                          : 'time-outline'
                      }
                      size={16}
                      color={colors.white}
                    />
                  </View>
                  <View style={styles.listCardText}>
                    <Text style={styles.listCardTitle} numberOfLines={1}>{nom.charityName}</Text>
                    <Text style={styles.listCardSub}>{nom.ein ? `EIN: ${nom.ein}  ·  ` : ''}{nom.date}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[nom.status] }]}>
                  <Text style={styles.statusText}>
                    {nom.status.charAt(0).toUpperCase() + nom.status.slice(1)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="clipboard-outline" size={32} color={colors.primaryLight} />
              <Text style={styles.emptyText}>No nominations yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const BANNER_HEIGHT = 140;
const AVATAR_SIZE = 88;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  banner: {
    height: BANNER_HEIGHT,
    backgroundColor: colors.primary,
    justifyContent: 'flex-end',
  },
  bannerActions: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? spacing.xxl : spacing.lg,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  adminChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.round,
  },
  adminChipText: {
    color: colors.cardBackground,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
  },
  settingsBtn: {
    padding: spacing.xs,
  },

  avatarWrapper: {
    alignSelf: 'center',
    marginTop: -AVATAR_OVERLAP,
    zIndex: 10,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.cardBackground,
  },

  
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },

  identitySection: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  displayName: {
    fontSize: typography.sizes.xxl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  handle: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_500Medium',
    color: colors.primaryLight,
    fontWeight: typography.weights.medium,
  },
  usernameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: 4,
  },
  atSign: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_500Medium',
    color: colors.primaryLight,
    fontWeight: typography.weights.medium,
    marginRight: 2,
  },
  usernameInput: {
    flex: 1,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.text,
    paddingVertical: 0,
  },
  iconBtn: {
    padding: 2,
    marginLeft: spacing.xs,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_500Medium',
    color: colors.grey,
    fontWeight: typography.weights.medium,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },

  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },

  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  listCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  donationIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCardText: {
    flex: 1,
  },
  listCardTitle: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
    color: colors.text,
  },
  listCardSub: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
    marginTop: 2,
  },
  donationAmount: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.success,
  },

  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.round,
  },
  statusText: {
    color: colors.white,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
  },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
  },

  notLoggedInTitle: {
    fontSize: typography.sizes.xxl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  notLoggedInSubtitle: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  loginButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.round,
    marginBottom: spacing.sm,
    width: '80%',
    alignItems: 'center',
  },
  loginButtonText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
  },
  signupButton: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.round,
    borderWidth: 1.5,
    borderColor: colors.primary,
    width: '80%',
    alignItems: 'center',
  },
  signupButtonText: {
    color: colors.primary,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
  },

  mutedText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
  },
  errorText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.error,
    marginBottom: spacing.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
  },
});
