import { colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../services/supabase';

const HCAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY ?? '10000000-ffff-ffff-ffff-000000000001';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const captchaRef = useRef(null);

  // read the returnTo param if it was passed from the vote/donation screen
  const { returnTo } = useLocalSearchParams<{ returnTo: string }>();

  // validates fields then triggers captcha
  const handleLogin = () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    captchaRef.current?.show();
  };

  // called by hCaptcha with the result
  const onCaptchaMessage = async (event: any) => {
    if (!event?.nativeEvent?.data) return;

    const data = event.nativeEvent.data;

    if (data === 'open') return;

    if (data === 'challenge-closed') {
      captchaRef.current?.hide();
      return;
    }

    if (event.success) {
      captchaRef.current?.hide();
      event.markUsed();

      // dat is the capcha token
      await submitLogin(data); 
    } else {
      captchaRef.current?.hide();
      Alert.alert('Verification Failed', 'Captcha could not be completed. Please try again.');
    }
  };

  const submitLogin = async (captchaToken: string) => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: {
        captchaToken, 
      },
    });

    setLoading(false);

    if (error) {
      Alert.alert('Login Failed', error.message);
    } else {
      router.replace('/(tabs)');
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

      {/* Centered content */}
      <View style={styles.content}>
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.subtitle}>Login to use Fund-It</Text>

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
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
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

        <TouchableOpacity onPress={() => router.push({
          pathname: '/(auth)/signup',
          params: { returnTo: returnTo ?? '/(tabs)' }
        })}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkBold}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>

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
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.lg,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.cardBackground,
    padding: 15,
    borderRadius: 10,
    marginBottom: spacing.md,
    fontSize: typography.sizes.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 10,
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