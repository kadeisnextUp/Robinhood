import { router } from 'expo-router';
import { useEffect } from 'react';

export default function DonateCancel() {
  useEffect(() => {
    // Navigate back to donate tab if user cancels
    router.replace('/(tabs)/donate');
  }, []);

  return null;
}
