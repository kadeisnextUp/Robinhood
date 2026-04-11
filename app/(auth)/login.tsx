import { colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../services/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { returnTo } = useLocalSearchParams<{ returnTo: string }>();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert('Login Failed', error.message);
      } else {
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      Alert.alert('Login Failed', e?.message ?? 'An unexpected error occurred.');
    } finally {
      setLoading(false);
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

      <View style={styles.content}>
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.subtitle}>Login to use Fund-It</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.grey}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.grey}
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
    fontWeight: typography.weights.bold as any,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.lg,
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
    fontWeight: typography.weights.bold as any,
  },
  linkText: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.textLight,
  },
  linkBold: {
    color: colors.primary,
    fontWeight: typography.weights.bold as any,
  },
});
