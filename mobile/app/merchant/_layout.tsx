import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Colors } from '../../src/theme/colors';

export default function MerchantLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.success,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarStyle: { backgroundColor: '#0D0D0D', borderTopColor: 'rgba(255,255,255,0.1)' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mi negocio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          title: 'Cobrar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="withdraw"
        options={{
          title: 'Retirar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="arrow-down-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          title: 'Terminal',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
