import {
  Fredoka_300Light,
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import * as Sentry from '@sentry/react-native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from '../contexts/authContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { deepLinkStore } from '../services/deepLinkStore';
import { posthog } from '../src/config/posthog';

Sentry.init({
  dsn: 'https://82e2b40542db948cc8d548c9a7ccbcfb@o4511378753257472.ingest.us.sentry.io/4511379227213824',

  // adds more context data to events (IP address, cookies, user, etc.)
  sendDefaultPii: true,

  // enable Logs
  enableLogs: true,

  // configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight 
  // spotlight: __DEV__,
});

SplashScreen.preventAutoHideAsync();

function AppContent() {
  usePushNotifications();
  const { loading } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);


  // Capture reset-password deep link URLs before the screen mounts.
  // The screen's own listeners register too late (after Expo Router has already
  // processed the URL and navigated), so we grab the code here and store it.
  useEffect(() => {
    const handleResetUrl = (url: string | null) => {
      if (!url?.includes('reset-password')) return;
      console.log('[Layout] reset-password URL:', url);
      const codeMatch = url.match(/[?&]code=([^&#]+)/);
      if (codeMatch) {
        deepLinkStore.setResetCode(decodeURIComponent(codeMatch[1]));
      } else if (url.includes('error')) {
        deepLinkStore.setResetError();
      }
    };

    // Cold start: app launched by the deep link
    Linking.getInitialURL().then(url => {
      console.log('[Layout] getInitialURL:', url);
      handleResetUrl(url);
    });

    // Warm start: app already running when link is tapped
    const sub = Linking.addEventListener('url', ({ url }) => {
      console.log('[Layout] url event:', url);
      handleResetUrl(url);
    });

    return () => sub.remove();
  }, []);

  // manual screen tracking for Expo Router
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      posthog.screen(pathname, {
        previous_screen: previousPathname.current ?? null,
        ...params,
      });
      previousPathname.current = pathname;
    }
  }, [pathname, params]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fredoka_300Light,
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <PostHogProvider
      client={posthog}
      autocapture={{
        captureScreens: false,
        captureTouches: true,
        propsToCapture: ['testID'],
        maxElementsCaptured: 20,
      }}
    >
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </PostHogProvider>
  );
});
