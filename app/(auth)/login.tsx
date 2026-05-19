import { colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../services/supabase';
import { usePostHog } from 'posthog-react-native';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const posthog = usePostHog();

  const { returnTo } = useLocalSearchParams<{ returnTo: string }>();

  const handleForgotPassword = async () => {
    const raw = resetEmail.trim();
    if (!raw) {
      Alert.alert('Error', 'Please enter your email or username.');
      return;
    }

    setLoading(true);
    try {
      let email = raw;

      if (!raw.includes('@')) {
        const { data: lookedUpEmail, error: rpcError } = await supabase.rpc(
          'get_email_by_username',
          { p_username: raw.toLowerCase() }
        );
        if (rpcError || !lookedUpEmail) {
          Alert.alert('Error', 'No account found with that username.');
          return;
        }
        email = lookedUpEmail;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'fundit://reset-password',
      });

      if (error) throw error;

      setResolvedEmail(email);
      setResetSent(true);
      posthog.capture('password_reset_requested');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = resetCode.trim();
    if (!/^\d{6,8}$/.test(code)) {
      Alert.alert('Error', 'Enter the reset code from your email.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: resolvedEmail,
        token: code,
        type: 'recovery',
      });
      if (error) throw error;
      posthog.capture('password_reset_otp_verified');
      router.push('/reset-password');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Invalid code. Try requesting a new one.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!identifier || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const trimmed = identifier.trim();
      let emailToUse = trimmed;

      // If input has no @ it's a username — look up the associated email
      if (!trimmed.includes('@')) {
        const { data: lookedUpEmail, error: rpcError } = await supabase.rpc(
          'get_email_by_username',
          { p_username: trimmed.toLowerCase() }
        );

        if (rpcError || !lookedUpEmail) {
          Alert.alert('Login Failed', 'Invalid username or password');
          return;
        }

        emailToUse = lookedUpEmail;
      }

      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });

      if (error) {
        Alert.alert('Login Failed', 'Invalid username or password');
      } else {
        const userId = signInData.user?.id;
        const username = trimmed.includes('@') ? undefined : trimmed.toLowerCase();
        posthog.identify(userId ?? emailToUse, {
          $set: { email: emailToUse, ...(username ? { username } : {}) },
          $set_once: { first_login_date: new Date().toISOString() },
        });
        posthog.capture('user_logged_in', {
          login_method: trimmed.includes('@') ? 'email' : 'username',
        });
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      Alert.alert('Login Failed', e?.message ?? 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (forgotMode) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => { setForgotMode(false); setResetSent(false); setResetEmail(''); setResetCode(''); }}>
          <Ionicons name="arrow-back" size={32} color={colors.secondary} />
        </TouchableOpacity>

        <View style={styles.content}>
          {resetSent ? (
            <>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.subtitle}>
                Enter the reset code sent to {resolvedEmail}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Reset code"
                placeholderTextColor={colors.grey}
                value={resetCode}
                onChangeText={text => setResetCode(text.replace(/\D/g, '').slice(0, 8))}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleVerifyOtp}
                maxLength={8}
                autoFocus
              />
              <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify Code'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setResetSent(false); setResetCode(''); }} style={styles.forgotLink}>
                <Text style={styles.linkBold}>Resend Code</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setForgotMode(false); setResetSent(false); setResetEmail(''); setResetCode(''); }}>
                <Text style={[styles.linkText, { marginTop: 8 }]}>Back to Login</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>Enter your email or username and we'll send a reset link</Text>

              <TextInput
                style={styles.input}
                placeholder="Email or Username"
                placeholderTextColor={colors.grey}
                value={resetEmail}
                onChangeText={setResetEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={handleForgotPassword}
                autoFocus
              />

              <TouchableOpacity style={styles.button} onPress={handleForgotPassword} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Reset Link'}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setForgotMode(false)}>
                <Text style={styles.linkText}>
                  Remembered it? <Text style={styles.linkBold}>Back to Login</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={32} color={colors.secondary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.subtitle}>Login to use Fund-It</Text>

        <TextInput
          style={styles.input}
          placeholder="Email or Username"
          placeholderTextColor={colors.grey}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />

        <TextInput
          ref={passwordRef}
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.grey}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Logging in...' : 'Login'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setForgotMode(true)} style={styles.forgotLink}>
          <Text style={styles.linkBold}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push({
          pathname: '/(auth)/signup',
          params: { returnTo: returnTo ?? '/(tabs)' }
        })}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkBold}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'flex-start',
    paddingTop: 300,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold as any,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    marginBottom: spacing.xl,
    textAlign: 'center',
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
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold as any,
  },
  forgotLink: {
    marginTop: 14,
    alignItems: 'center',
  },
  linkText: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.textLight,
  },
  linkBold: {
    color: colors.primary,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold as any,
  },
});
