import { colors, spacing } from '@/src/theme';
import { FontAwesome5, Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.textDark,
        tabBarInactiveTintColor: colors.textLight,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.cardBackground,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: spacing.xl * 2,
          paddingBottom: spacing.xs,
          paddingTop: spacing.xs,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="receipts"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="receipt" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="donate"
        options={{
          title: 'Donate',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="attach-money" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Vote',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="vote-yea" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="poll"
        options={{
          title: 'Polls',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="poll" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
