import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { deepLinkStore } from '../services/deepLinkStore';
import { supabase } from '../services/supabase';
import { colors, spacing, typography } from '../src/theme';

export default function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [done, setDone] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const confirmRef = useRef<TextInput>(null);
  const posthog = usePostHog();

  useEffect(() => {
    let settled = false;

    const log = (msg: string) => {
      console.log('[ResetPassword]', msg);
      setDebugLog(prev => [...prev, msg]);
    };

    const resolve = (success: boolean) => {
      if (settled) return;
      settled = true;
      log(`resolve(${success})`);
      if (success) setSessionReady(true);
      else setSessionError(true);
    };

    const exchange = (code: string) => {
      log(`exchange start: ${code.slice(0, 20)}...`);
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          log(`exchange error: ${error.message}`);
          resolve(false);
        } else {
          log('exchange ok — waiting for onAuthStateChange');
        }
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      log(`onAuthStateChange: event=${event} session=${session ? 'yes' : 'no'}`);
      if (session) resolve(true);
    });

    const timer = setTimeout(() => { log('timeout — no code received'); resolve(false); }, 10_000);

    // root layout captured the URL before this screen mounted
    const hasError = deepLinkStore.consumeResetError();
    const stored = deepLinkStore.consumeResetCode();
    log(`store error=${hasError} code=${stored ? stored.slice(0, 20) + '...' : 'null'}`);

    if (hasError) {
      log('link expired/invalid (from URL error param)');
      resolve(false);
    } else if (stored) {
      exchange(stored);
    } else {
      // app was launched directly by the deep link
      Linking.getInitialURL().then(url => {
        log(`getInitialURL: ${url ?? 'null'}`);
        if (!url) return;
        if (url.includes('error')) { log('error in initial URL'); resolve(false); return; }
        const m = url.match(/[?&]code=([^&#]+)/);
        const code = m ? decodeURIComponent(m[1]) : null;
        log(`extracted code: ${code ? code.slice(0, 20) + '...' : 'null'}`);
        if (code) exchange(code);
      });
    }

    return () => {
      settled = true;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleReset = async () => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      Alert.alert('Error', 'Password must be at least 8 characters and include an uppercase letter, lowercase letter, and number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      posthog.capture('password_reset_completed');
      setDone(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update password. The reset link may have expired — request a new one.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="checkmark-circle" size={72} color={colors.success ?? colors.primary} />
        <Text style={styles.title}>Password Updated!</Text>
        <Text style={styles.subtitle}>You can now log in with your new password.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.buttonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const DebugLog = () => (
    <ScrollView style={styles.debugBox} contentContainerStyle={{ padding: 8 }}>
      <Text style={styles.debugTitle}>DEBUG LOG</Text>
      {debugLog.map((line, i) => (
        <Text key={i} style={styles.debugLine}>{line}</Text>
      ))}
      {debugLog.length === 0 && <Text style={styles.debugLine}>waiting…</Text>}
    </ScrollView>
  );

  if (sessionError) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle-outline" size={72} color={colors.error ?? colors.primary} />
        <Text style={styles.title}>Link Expired</Text>
        <Text style={styles.subtitle}>This reset link is invalid or has expired. Request a new one from the login screen.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.buttonText}>Back to Login</Text>
        </TouchableOpacity>
        <DebugLog />
      </View>
    );
  }

  if (!sessionReady) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.subtitle, { marginTop: spacing.md }]}>Verifying reset link...</Text>
        <DebugLog />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
        <Ionicons name="arrow-back" size={32} color={colors.primary} />
      </TouchableOpacity>

      <Text style={styles.title}>Set New Password</Text>
      <Text style={styles.subtitle}>Choose a strong password for your account</Text>

      <TextInput
        style={styles.input}
        placeholder="New Password (min 8 chars, upper, lower, number)"
        placeholderTextColor={colors.grey}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        submitBehavior="submit"
        autoFocus
      />

      <TextInput
        ref={confirmRef}
        style={styles.input}
        placeholder="Confirm New Password"
        placeholderTextColor={colors.grey}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={handleReset}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleReset}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Updating...' : 'Update Password'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  input: {
    backgroundColor: colors.cardBackground,
    padding: 15,
    borderRadius: 10,
    marginBottom: spacing.md,
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_400Regular',
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
  },
  debugBox: {
    marginTop: 24,
    width: '100%',
    maxHeight: 220,
    backgroundColor: '#111',
    borderRadius: 8,
  },
  debugTitle: {
    color: '#0f0',
    fontFamily: 'Fredoka_700Bold',
    fontSize: 11,
    marginBottom: 4,
  },
  debugLine: {
    color: '#cfc',
    fontFamily: 'Fredoka_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
});
