import {
  Fredoka_300Light,
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { AuthProvider, useAuth } from '../contexts/authContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

SplashScreen.preventAutoHideAsync();

// React 19 removed defaultProps for function components, so patch render directly.
// This prepends fontFamily to the style array so it applies even when a style prop is passed.
const patchFont = (Component: any) => {
  const original = Component.render;
  if (typeof original !== 'function') return;
  Component.render = function (props: any, ref: any) {
    const base = { fontFamily: 'Fredoka_400Regular' };
    const style = Array.isArray(props.style)
      ? [base, ...props.style]
      : props.style != null ? [base, props.style] : base;
    return original.call(this, { ...props, style }, ref);
  };
};

patchFont(Text);
patchFont(TextInput);

function AppContent() {
  usePushNotifications();
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fredoka_300Light,
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
