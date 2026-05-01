import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../contexts/authContext';
import { supabase } from '../services/supabase';
import { borderRadius, colors, spacing, typography } from '../src/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [userEmail, setUserEmail] = useState<string>('');
  const [userUsername, setUserUsername] = useState<string>('');

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifLoadingRef = useRef(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  useEffect(() => {
    if (!session) return;
    setUserEmail(session.user.email ?? '');
    supabase
      .from('profiles')
      .select('phone, email_notifications, username')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data }) => {
        setEmailNotifications(data?.email_notifications ?? true);
        setUserUsername(data?.username ?? session.user.user_metadata?.username ?? '');
      });
  }, [session]);

  useEffect(() => {
    const checkPermission = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      setPushNotifications(status === 'granted');
    };

    checkPermission();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermission();
    });

    return () => sub.remove();
  }, []);

  const handleEmailNotificationsToggle = async (value: boolean) => {
    setEmailNotifications(value);
    if (!session) return;
    await supabase
      .from('profiles')
      .update({ email_notifications: value })
      .eq('user_id', session.user.id);
  };

  const handlePushNotificationsToggle = async (value: boolean) => {
    if (!session || notifLoadingRef.current) return;
    notifLoadingRef.current = true;
    setNotifLoading(true);

    if (value) {
      const { status } = await Notifications.getPermissionsAsync();

      if (status === 'denied') {
        Alert.alert(
          'Notifications Disabled',
          'Push notifications are disabled for this app. Enable them in your device Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        notifLoadingRef.current = false;
        setNotifLoading(false);
        return;
      }

      let granted = status === 'granted';
      if (!granted) {
        const { status: requested } = await Notifications.requestPermissionsAsync();
        granted = requested === 'granted';
      }

      if (!granted) {
        notifLoadingRef.current = false;
        setNotifLoading(false);
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

      const { error } = await supabase.functions.invoke('register-push-token', {
        body: { token },
      });

      if (error) {
        Alert.alert('Error', 'Could not register for push notifications. Please try again.');
        notifLoadingRef.current = false;
        setNotifLoading(false);
        return;
      }

      setPushNotifications(true);
    } else {
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('user_id', session.user.id);

      Alert.alert(
        'Disable Push Notifications',
        'To fully disable push notifications, turn them off in your device Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }

    notifLoadingRef.current = false;
    setNotifLoading(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.back();
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    await supabase.auth.signOut();
    setDeleteModalVisible(false);
    router.back();
  };

  return (
    <View style={styles.container}>

      {/* ── header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── profile mini card ── */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={28} color={colors.white} />
          </View>
          <View style={styles.profileCardText}>
            <Text style={styles.profileCardName}>{userUsername ? `@${userUsername}` : 'Your Account'}</Text>
            <Text style={styles.profileCardEmail} numberOfLines={1}>{userEmail || '—'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primaryLight} />
        </View>

        {/* ── account ── */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <SettingsRow icon="person-outline" label="Username" value={userUsername ? `@${userUsername}` : '—'} />
          <SettingsRow icon="mail-outline" label="Email" value={userEmail || '—'} last />
          <SettingsRow
            icon="lock-closed-outline"
            label="Change Password"
            onPress={() => router.push('/change-password')}
            showChevron
            last
          />
        </View>

        {/* ── notifications ── */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="mail-unread-outline"
            label="Email Notifications"
            last={false}
            toggle={
              <Switch
                value={emailNotifications}
                onValueChange={handleEmailNotificationsToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            }
          />
          <SettingsRow
            icon="notifications-outline"
            label="Push Notifications"
            last
            toggle={
              <Switch
                value={pushNotifications}
                onValueChange={handlePushNotificationsToggle}
                disabled={notifLoading}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            }
          />
        </View>

        {/* ── tax Documents ── */}
        <Text style={styles.sectionLabel}>Tax Documents</Text>
        <View style={styles.card}>
          <View style={styles.comingSoonBanner}>
            <Ionicons name="document-text-outline" size={20} color={colors.primaryLight} />
            <Text style={styles.comingSoonText}>Coming soon — generate tax documents based on your donation history.</Text>
          </View>
          <SettingsRow icon="newspaper-outline" label="Annual Donation Summary" value="Coming Soon" last />
        </View>

        {/* ── voting & Transparency ── */}
        <Text style={styles.sectionLabel}>Voting & Transparency</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="heart-outline"
            label="This Week's Charities"
            onPress={() => router.push('/')}
            showChevron
          />
          <SettingsRow
            icon="receipt-outline"
            label="Donation Proof History"
            onPress={() => router.push('/(tabs)/receipts')}
            showChevron
            last
          />
        </View>

        {/* ── security ── */}
        <Text style={styles.sectionLabel}>Security</Text>
        <View style={styles.card}>
          <SettingsRow icon="shield-checkmark-outline" label="Two-Factor Authentication" value="Coming Soon" />
          <SettingsRow icon="alert-circle-outline" label="Login Alerts" value="Coming Soon" last />
        </View>

        {/* ── support ── */}
        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.card}>
          <SettingsRow icon="chatbubble-outline" label="Contact Us" value="funditsupport@gmail.com" />
          <SettingsRow icon="help-circle-outline" label="FAQ" value="fund-it.app/faq" />
          <SettingsRow
            icon="bug-outline"
            label="Report a Bug"
            onPress={() =>
              Linking.openURL(
                `mailto:funditsupport@gmail.com?subject=${encodeURIComponent('Fund-It Bug Report')}&body=${encodeURIComponent('Describe the issue:\n\nSteps to reproduce:\n\nWhat screen were you on:\n\nDevice/OS:\n')}`
              )
            }
            showChevron
            last
          />
        </View>

        {/* ── legal ── */}
        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.card}>
          <SettingsRow icon="document-text-outline" label="Terms of Service" value="Coming Soon" />
          <SettingsRow icon="eye-outline" label="Privacy Policy" value="Coming Soon" last />
        </View>

        {/* ── about ── */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <SettingsRow icon="information-circle-outline" label="Version" value="1.0.0" last />
        </View>

        {/* ── account Management ── */}
        <View style={styles.dangerSection}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color={colors.primary} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setDeleteModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={18} color={colors.white} />
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── delete Account Modal ── */}
      <Modal
        transparent
        animationType="fade"
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="warning-outline" size={28} color={colors.error} />
            </View>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalMessage}>
              This will permanently delete your account and all associated data. This action cannot
              be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setDeleteModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={handleDeleteAccount}>
                <Text style={styles.modalConfirmText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}


interface SettingsRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  toggle?: React.ReactNode;
  last?: boolean;
}

function SettingsRow({ icon, label, value, onPress, showChevron, toggle, last }: SettingsRowProps) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.rowLeft}>
        <View style={styles.rowIconWrap}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {toggle ?? (
          <>
            {value && (
              <Text style={styles.rowValue} numberOfLines={1}>
                {value}
              </Text>
            )}
            {showChevron && (
              <Ionicons name="chevron-forward" size={16} color={colors.primaryLight} />
            )}
          </>
        )}
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0EB',
  },

  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? spacing.xxl + spacing.md : spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#F5F0EB',
  },
  backBtn: {
    padding: spacing.xs,
    width: 36,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  headerRight: {
    width: 36,
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  profileCardText: {
    flex: 1,
  },
  profileCardName: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  profileCardEmail: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
    marginTop: 2,
  },

  sectionLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
    color: colors.grey,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.xs,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_500Medium',
    color: colors.text,
    fontWeight: typography.weights.medium,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '45%',
  },
  rowValue: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
    textAlign: 'right',
    flexShrink: 1,
  },

  dangerSection: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  signOutText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.error,
  },
  deleteButtonText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.white,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${colors.error}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalMessage: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalCancel: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_500Medium',
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.error,
    alignItems: 'center',
  },
  comingSoonBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: `${colors.primary}0D`,
    borderRadius: borderRadius.lg,
    margin: spacing.md,
    padding: spacing.md,
  },
  comingSoonText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
    lineHeight: 18,
  },
  modalConfirmText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.white,
  },
});
