import { colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../services/supabase';
import { isProfane } from '../../src/utils/profanity';
import { usePostHog } from 'posthog-react-native';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const MINIMUM_AGE = 13;

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}

export default function SignupScreen() {
  const [username, setUsername] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const posthog = usePostHog();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateOfBirth(selectedDate);
    }
  };

  const handleSignup = async () => {
    if (!username || !dateOfBirth || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (calculateAge(dateOfBirth) < MINIMUM_AGE) {
      Alert.alert('Error', `You must be at least ${MINIMUM_AGE} years old to create an account.`);
      return;
    }

    if (username.includes(' ')) {
      Alert.alert('Invalid Username', 'Username cannot contain spaces. Use letters, numbers, underscores (_), or hyphens (-) only.');
      return;
    }

    if (!USERNAME_REGEX.test(username)) {
      Alert.alert('Invalid Username', 'Username must be 3–20 characters and can only contain letters, numbers, underscores (_), and hyphens (-)');
      return;
    }

    if (isProfane(username)) {
      Alert.alert('Error', 'That username is not allowed');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      Alert.alert('Error', 'Password must be at least 8 characters and include an uppercase letter, lowercase letter, and number');
      return;
    }

    setLoading(true);

    try {
      // Check username uniqueness before creating the account
      const { data: existing } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username.toLowerCase())
        .maybeSingle();

      if (existing) {
        Alert.alert('Error', 'That username is already taken');
        return;
      }

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: username.toLowerCase(),
            date_of_birth: dateOfBirth.toISOString().split('T')[0],
          },
        },
      });

      if (error) {
        Alert.alert('Signup Failed', error.message);
      } else {
        posthog.identify(signUpData.user?.id ?? email.trim(), {
          $set: { email: email.trim(), username: username.toLowerCase() },
          $set_once: { signup_date: new Date().toISOString() },
        });
        posthog.capture('user_signed_up', {
          username: username.toLowerCase(),
        });
        Alert.alert(
          'Check Your Email!',
          'We sent you a confirmation email. Please verify your email before logging in.',
          [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
        );
      }
    } catch (e: any) {
      Alert.alert('Signup Failed', e?.message ?? 'An unexpected error occurred.');
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

      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join the charity voting community</Text>

      <TextInput
        style={styles.input}
        placeholder="Username (3–20 chars, letters, numbers, _ -)"
        placeholderTextColor={colors.grey}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        submitBehavior="submit"
      />

      <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
        <Text style={dateOfBirth ? styles.dateText : styles.datePlaceholder}>
          {dateOfBirth ? dateOfBirth.toLocaleDateString() : 'Date of Birth'}
        </Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={dateOfBirth ?? new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={handleDateChange}
        />
      )}

      <TextInput
        ref={emailRef}
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.grey}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
      />

      <TextInput
        ref={passwordRef}
        style={styles.input}
        placeholder="Password (min 8 chars, upper, lower, number)"
        placeholderTextColor={colors.grey}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        submitBehavior="submit"
      />

      <TextInput
        ref={confirmRef}
        style={styles.input}
        placeholder="Confirm Password"
        placeholderTextColor={colors.grey}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={handleSignup}
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
    fontFamily: 'Fredoka_700Bold',
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    marginBottom: 40,
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
  dateText: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_400Regular',
    color: colors.text,
  },
  datePlaceholder: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_400Regular',
    color: colors.grey,
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
    color: colors.white,
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
  },
  linkText: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.textLight,
  },
  linkBold: {
    color: colors.primary,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
  },
});
