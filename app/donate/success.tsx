import { router } from 'expo-router';
import { useEffect } from 'react';

export default function DonateSuccess() {
  useEffect(() => {
    // Navigate back to donate tab after successful payment
    router.replace('/(tabs)/donate');
  }, []);

  return null;
}
