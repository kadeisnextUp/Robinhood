import { colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../services/supabase';

const HCAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY ?? '10000000-ffff-ffff-ffff-000000000001';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const captchaRef = useRef(null);

  // read the returnTo param
  const { returnTo } = useLocalSearchParams<{ returnTo: string }>();

  // when the user taps Sign Up — validates fields, then triggers captcha
  const handleSignup = () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    // all validation passed — show the captcha
    captchaRef.current?.show();
  };

  // called by hCaptcha with the result
  const onCaptchaMessage = async (event: any) => {
    if (!event?.nativeEvent?.data) return;

    const data = event.nativeEvent.data;

    if (data === 'open') {
      // challenge modal is showing 
      return;
    }

    if (data === 'challenge-closed') {
      // user dismissed the challenge without completing it
      captchaRef.current?.hide();
      return;
    }

    if (event.success) {
      // Captcha passed 
      captchaRef.current?.hide();
      event.markUsed(); 

      await submitSignup(data); // data is the captcha token
    } else {
      // an error occurred (network issue, expired, etc.)
      captchaRef.current?.hide();
      Alert.alert('Verification Failed', 'Captcha could not be completed. Please try again.');
    }
  };

  // submits the signup to Supabase, passing the captcha token.
  const submitSignup = async (captchaToken: string) => {
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        captchaToken,
      },
    });

    setLoading(false);

    if (error) {
      Alert.alert('Signup Failed', error.message);
    } else {
      Alert.alert(
        'Check Your Email!',
        'We sent you a confirmation email. Please verify your email before logging in.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={32} color={colors.secondary} />
      </TouchableOpacity>

      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join the charity voting community</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password (min 6 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleSignup}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Creating Account...' : 'Sign Up'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.linkText}>
          Already have an account? <Text style={styles.linkBold}>Login</Text>
        </Text>
      </TouchableOpacity>

      {/* hCaptcha renders invisibly until triggered by captchaRef.current?.show() */}
      <ConfirmHcaptcha
        ref={captchaRef}
        siteKey={HCAPTCHA_SITE_KEY}
        languageCode="en"
        onMessage={onCaptchaMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginBottom: 40,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: spacing.md,
    fontSize: typography.sizes.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: spacing.sm,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: colors.textOnPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  linkText: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  linkBold: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
});