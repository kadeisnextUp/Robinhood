import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/authContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

function AppContent() {
  usePushNotifications();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
