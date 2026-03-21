import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen name="index"          options={{ headerShown: false }} />
        <Stack.Screen name="login"          options={{ headerShown: false }} />
        <Stack.Screen name="register"       options={{ headerShown: false }} />
        {/* Full-screen QR scanner — no header, no tab bar */}
        <Stack.Screen name="scan"           options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        {/* Payment confirmation */}
        <Stack.Screen name="confirm/[id]"   options={{ title: 'Confirmar pago', headerBackTitle: 'Cancelar' }} />
        {/* Main app tabs */}
        <Stack.Screen name="customer"       options={{ headerShown: false }} />
        <Stack.Screen name="merchant"       options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
