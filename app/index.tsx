import { Redirect } from 'expo-router';

export default function Index() {
  // Always redirect to tabs - no auth check
  return <Redirect href="/(tabs)" />;
}