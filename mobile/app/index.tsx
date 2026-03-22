import { Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Colors, Gradients } from '../src/theme/colors';

export default function Index() {
  const { token, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <LinearGradient colors={Gradients.blue} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={Colors.white} size="large" />
      </LinearGradient>
    );
  }

  if (!token) return <Redirect href="/login" />;
  if (role === 'merchant') return <Redirect href="/merchant" />;
  return <Redirect href="/customer" />;
}
