import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { ApiError, api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors } from '../../src/theme/colors';

export default function CustomerWalletScreen() {
  const { token } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [pub, setPub] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [faucetAmount, setFaucetAmount] = useState('100');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await api.getWalletBalance(token);
      setBalance(r.mxne_balance);
      setPub(r.public_key);
      log.action('CarteraCliente', 'Saldo actualizado', { mxne: r.mxne_balance });
    } catch (e) {
      log.error('CarteraCliente', e);
      Alert.alert('Error', e instanceof ApiError ? e.message : 'No se pudo cargar el saldo');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onBootstrap = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await api.bootstrapTestnet(token);
      Alert.alert(
        'Testnet listo',
        `${r.message}\n\nTrustline tx: ${r.change_trust_tx_hash.slice(0, 16)}…`,
      );
      await refresh();
    } catch (e) {
      log.error('CarteraCliente', e);
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Bootstrap falló');
    } finally {
      setLoading(false);
    }
  };

  const onFaucet = async () => {
    if (!token) return;
    const n = parseFloat(faucetAmount.replace(',', '.'));
    if (!n || n <= 0) {
      Alert.alert('Monto', 'Ingresa un monto válido');
      return;
    }
    setLoading(true);
    try {
      const r = await api.faucetMxne(n, token);
      Alert.alert('MXNe recibido (testnet)', `Tx: ${r.stellar_tx_hash.slice(0, 20)}…`);
      await refresh();
    } catch (e) {
      log.error('CarteraCliente', e);
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Faucet falló');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Mi cartera</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Saldo MXNe</Text>
          {loading && balance === null ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Text style={styles.balance}>{balance?.toFixed(2) ?? '—'}</Text>
          )}

          <TouchableOpacity style={styles.btnSecondary} onPress={refresh} disabled={loading}>
            <Text style={styles.btnSecondaryText}>Actualizar saldo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="Monto MXNe"
            placeholderTextColor={Colors.textLight}
            value={faucetAmount}
            onChangeText={setFaucetAmount}
          />
          <TouchableOpacity style={styles.btnSmall} onPress={onFaucet} disabled={loading}>
            <Text style={styles.btnText}>Recibir MXNe</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.surface },
  scroll: { padding: 20, paddingBottom: 40 },
  title:  { fontSize: 22, fontWeight: '800', color: Colors.textDark, marginBottom: 6 },
  sub:    { fontSize: 13, color: Colors.textLight, marginBottom: 20, lineHeight: 18 },
  card:   { backgroundColor: Colors.white, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  label:  { fontSize: 13, color: Colors.textLight, marginBottom: 4 },
  balance:{ fontSize: 32, fontWeight: '800', color: Colors.primary, marginBottom: 8 },
  pk:     { fontSize: 11, color: Colors.textLight, fontFamily: 'monospace', marginBottom: 12 },
  btn:    { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnText:{ color: Colors.white, fontWeight: '700', fontSize: 15 },
  btnSecondary: { alignItems: 'center', paddingVertical: 8 },
  btnSecondaryText: { color: Colors.primary, fontWeight: '600' },
  row:    { gap: 10 },
  input:  { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 8, color: Colors.textDark },
  btnSmall: { backgroundColor: Colors.success, borderRadius: 12, padding: 16, alignItems: 'center' },
});
