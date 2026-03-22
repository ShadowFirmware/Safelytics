import { useState } from 'react';
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

export default function MerchantWithdrawScreen() {
  const { token } = useAuth();
  const [dest, setDest] = useState('');
  const [amountStellar, setAmountStellar] = useState('');
  const [amountBank, setAmountBank] = useState('');
  const [clabe, setClabe] = useState('');
  const [loading, setLoading] = useState(false);

  const sendStellar = async () => {
    if (!token) return;
    const mxn = parseFloat(amountStellar.replace(',', '.'));
    if (!mxn || mxn <= 0) {
      Alert.alert('Monto', 'Ingresa un monto válido');
      return;
    }
    const d = dest.trim();
    if (!d.startsWith('G') || d.length < 50) {
      Alert.alert('Destino', 'Debe ser una dirección Stellar pública (G...)');
      return;
    }
    setLoading(true);
    log.action('RetiroComercio', 'Retiro Stellar', { amount_mxn: mxn });
    try {
      const r = await api.withdrawStellar({ destination: d, amount_mxn: mxn }, token);
      Alert.alert('Enviado', `Tx Stellar:\n${r.stellar_tx_hash}`);
      setAmountStellar('');
    } catch (e) {
      log.error('RetiroComercio', e);
      Alert.alert('Error', e instanceof ApiError ? e.message : 'No se pudo enviar');
    } finally {
      setLoading(false);
    }
  };

  const requestBank = async () => {
    if (!token) return;
    const mxn = parseFloat(amountBank.replace(',', '.'));
    if (!mxn || mxn <= 0) {
      Alert.alert('Monto', 'Ingresa un monto válido');
      return;
    }
    if (!clabe.trim()) {
      Alert.alert('CLABE', 'Ingresa CLABE o cuenta');
      return;
    }
    setLoading(true);
    try {
      const r = await api.withdrawBank({ amount_mxn: mxn, bank_account: clabe.trim() }, token);
      Alert.alert('Solicitud registrada', `${r.message}\nID: ${r.withdrawal_id.slice(0, 8)}…`);
      setAmountBank('');
      setClabe('');
    } catch (e) {
      log.error('RetiroComercio', e);
      Alert.alert('Error', e instanceof ApiError ? e.message : 'No se pudo registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Retirar fondos</Text>

        <TextInput
          style={styles.input}
          placeholder="Dirección destino..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="none"
          value={dest}
          onChangeText={setDest}
        />
        <TextInput
          style={styles.input}
          placeholder="Monto MXNe"
          placeholderTextColor="rgba(255,255,255,0.35)"
          keyboardType="decimal-pad"
          value={amountStellar}
          onChangeText={setAmountStellar}
        />
        <TouchableOpacity style={styles.btn} onPress={sendStellar} disabled={loading}>
          <LinearGradient colors={Gradients.purple} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.btnText}>Enviar MXNe</Text>}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.section, { marginTop: 28 }]}>Banco</Text>
        <Text style={styles.hint}>
          Registra la solicitud en el servidor. En producción se conectaría a un anchor / SPEI.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Monto (referencia)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          keyboardType="decimal-pad"
          value={amountBank}
          onChangeText={setAmountBank}
        />
        <TextInput
          style={styles.input}
          placeholder="CLABE / cuenta"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={clabe}
          onChangeText={setClabe}
        />
        <TouchableOpacity style={styles.btnBank} onPress={requestBank} disabled={loading}>
          <LinearGradient colors={Gradients.blue} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={styles.btnText}>Registrar retiro bancario</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.black },
  scroll:  { padding: 20, paddingBottom: 40 },
  title:   { fontSize: 22, fontWeight: '800', color: Colors.white, marginBottom: 16 },
  section: { fontSize: 15, fontWeight: '700', color: Colors.white, marginBottom: 8 },
  hint:    { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12, lineHeight: 17 },
  input:   { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 10, color: Colors.white },
  btn:        { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  btnBank:    { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  btnGradient:{ padding: 16, alignItems: 'center' },
  btnText:    { color: Colors.white, fontWeight: '700', fontSize: 16 },
});
