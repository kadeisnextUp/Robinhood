import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform, AppState } from 'react-native';
import { useEffect } from 'react';
import { useAuth } from '../contexts/authContext';
import { supabase } from '../services/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;
    registerForPushNotifications();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        clearBadge(session.user.id);
      }
    });

    // clear on initial mount (app opened from cold start via notification)
    clearBadge(session.user.id);

    return () => subscription.remove();
  }, [session]);
}

async function clearBadge(userId: string) {
  await Notifications.setBadgeCountAsync(0);
  await supabase
    .from('profiles')
    .update({ unread_notification_count: 0 })
    .eq('user_id', userId);
}

async function registerForPushNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await supabase.functions.invoke('register-push-token', {
      body: { token },
    });
  } catch (err) {
    console.log('Push notification registration error:', err);
  }
}
