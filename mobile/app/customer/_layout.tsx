import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Colors } from '../../src/theme/colors';

export default function CustomerLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarStyle: { backgroundColor: '#0D0D0D', borderTopColor: 'rgba(255,255,255,0.1)' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pagar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" size={size} color={color} />
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
        name="wallet"
        options={{
          title: 'Cartera',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Pantallas accesibles desde Cartera, no visibles en el tab bar */}
      <Tabs.Screen name="deposit" options={{ href: null, title: 'Recargar' }} />
      <Tabs.Screen name="bank-transfer" options={{ href: null, title: 'Transferir' }} />
    </Tabs>
  );
}
