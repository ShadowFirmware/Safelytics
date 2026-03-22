import { useFocusEffect, useRouter } from 'expo-router';
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
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { ApiError, api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors, Gradients } from '../../src/theme/colors';
import { fmtMXN } from '../../src/utils/format';

export default function CustomerWalletScreen() {
  const { token, logout } = useAuth();
  const router = useRouter();
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

  const onLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
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

        {/* Acciones rápidas */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/customer/deposit')}
          >
            <LinearGradient colors={Gradients.purple} style={styles.actionGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.actionText}>+ Recargar</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/customer/bank-transfer')}
          >
            <LinearGradient colors={Gradients.blue} style={styles.actionGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.actionText}>→ Transferir</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Saldo MXNe</Text>
          {loading && balance === null ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Text style={styles.balance}>{balance != null ? fmtMXN(balance) : '—'}</Text>
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
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={faucetAmount}
            onChangeText={setFaucetAmount}
          />
          <TouchableOpacity style={styles.btnSmall} onPress={onFaucet} disabled={loading}>
            <LinearGradient colors={Gradients.purple} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.btnText}>Recibir MXNe</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.btnLogout} onPress={onLogout}>
          <LinearGradient colors={['#7f1d1d', '#991b1b']} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={styles.btnText}>Cerrar sesión</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.black },
  scroll: { padding: 20, paddingBottom: 40 },
  title:  { fontSize: 22, fontWeight: '800', color: Colors.white, marginBottom: 6 },
  sub:    { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 18 },
  card:   { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  label:  { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  balance:{ fontSize: 32, fontWeight: '800', color: Colors.primary, marginBottom: 8 },
  pk:     { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', marginBottom: 12 },
  btn:    { borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  btnGradient: { padding: 16, alignItems: 'center' },
  btnText:{ color: Colors.white, fontWeight: '700', fontSize: 15 },
  btnSecondary: { alignItems: 'center', paddingVertical: 8 },
  btnSecondaryText: { color: Colors.primary, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  actionGradient: { padding: 14, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row:    { gap: 10 },
  input:  { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 8, color: Colors.white },
  btnSmall: { borderRadius: 12, overflow: 'hidden' },
  btnLogout: { borderRadius: 12, overflow: 'hidden', marginTop: 24 },
});
