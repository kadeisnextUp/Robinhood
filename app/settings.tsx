import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../services/supabase";
import { colors, spacing, typography } from "../src/theme";

export default function SettingsScreen() {
  const router = useRouter();

  // Notification toggles
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);

  // Delete account modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            // TODO: clear auth token / session and redirect to login
            await supabase.auth.signOut();
            router.back();
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    // TODO: call delete account API, then sign out and redirect
    await supabase.auth.signOut();
    setDeleteModalVisible(false);
    router.back();
  };

  const handleChangePassword = () => {
    // TODO: navigate to change password screen or send reset email
    router.push("/change-password");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.HeaderTitle}>Settings</Text>
      <Link
        href="/profile"
        asChild
        style={{ position: "absolute", top: spacing.xl + spacing.xl, left: spacing.lg }}
      >
        <Text style={styles.backButtonText}>
          <Ionicons name="arrow-back" size={32} color={colors.primary} />
        </Text>
      </Link>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── Account ── */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Account</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>john.doe@example.com</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone Number</Text>
            <Text style={styles.infoValue}>123-456-7890</Text>
          </View>

          <TouchableOpacity style={styles.infoRow} onPress={handleChangePassword}>
            <Text style={styles.infoLabel}>Change Password</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Notifications ── */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Notifications</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email Notifications</Text>
            <Switch
              value={emailNotifications}
              onValueChange={setEmailNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.cardBackground}
            />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Push Notifications</Text>
            <Switch
              value={pushNotifications}
              onValueChange={setPushNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.cardBackground}
            />
          </View>
        </View>

        {/* ── Voting & Transparency ── */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Voting & Transparency</Text>

          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => router.push("/charities")}
          >
            <Text style={styles.infoLabel}>This Week's Charities</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => router.push("/donation-history")}
          >
            <Text style={styles.infoLabel}>Donation Proof History</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Security ── */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Security</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Two-Factor Authentication</Text>
            <Text style={styles.infoValue}>Enabled</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Login Alerts</Text>
            <Text style={styles.infoValue}>Enabled</Text>
          </View>
        </View>

        {/* ── Support ── */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Support</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Contact Us</Text>
            <Text style={styles.infoValue}>support@app.com</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>FAQ</Text>
            <Text style={styles.infoValue}>www.app.com/faq</Text>
          </View>
        </View>

        {/* ── Legal ── */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Legal</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Terms of Service</Text>
            <Text style={styles.infoValue}>www.app.com/terms</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Privacy Policy</Text>
            <Text style={styles.infoValue}>www.app.com/privacy</Text>
          </View>
        </View>

        {/* ── About ── */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
        </View>

        {/* ── Account Management ── */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Account Management</Text>

          {/* Sign Out */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          {/* Delete Account */}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setDeleteModalVisible(true)}
          >
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Delete Account Confirmation Modal ── */}
      <Modal
        transparent
        animationType="fade"
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalMessage}>
              This will permanently delete your account and all associated data.
              This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirm}
                onPress={handleDeleteAccount}
              >
                <Text style={styles.modalConfirmText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
  },
  HeaderTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    backgroundColor: colors.background,
    textAlign: "center",
    paddingTop: spacing.xl,
  },
  backButtonText: {
    fontSize: typography.sizes.md,
    color: colors.primary,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  infoSection: {
    marginBottom: spacing.xxl,
  },
  infoTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: "left",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  infoValue: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },

  // Sign Out
  signOutButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  signOutText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },

  // Delete Account
  deleteButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 8,
    backgroundColor: "#D9534F",
    alignItems: "center",
  },
  deleteButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: "#fff",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: spacing.xl,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalMessage: {
    fontSize: typography.sizes.md,
    color: colors.text,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
  },
  modalCancel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  modalConfirm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: "#D9534F",
  },
  modalConfirmText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: "#fff",
  },
});