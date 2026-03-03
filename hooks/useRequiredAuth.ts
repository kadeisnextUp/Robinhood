import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useAuth } from '../contexts/authContext';

export function useRequireAuth() {
  const { session } = useAuth();

  const requireAuth = (action: () => void, actionName: string = 'perform this action') => {
    if (!session) {
      Alert.alert(
        'Login Required',
        `Please login or create an account to ${actionName}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/(auth)/login') },
        ]
      );
      return false;
    }
    action();
    return true;
  };

  return { requireAuth, isAuthenticated: !!session };
}