import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Colors } from '../src/theme/colors';

export default function Index() {
  const { token, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator color={Colors.white} size="large" />
      </View>
    );
  }

  if (!token) return <Redirect href="/login" />;
  if (role === 'merchant') return <Redirect href="/merchant" />;
  return <Redirect href="/customer" />;
}
