import { Ionicons } from '@expo/vector-icons';
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
import { Colors, Gradients } from '../../src/theme/colors';
import { fmtMXN } from '../../src/utils/format';

type DepositInfo = {
  deposit_id: string;
  clabe: string;
  bank_name: string;
  amount_mxn: number;
  status: string;
  instructions: string;
};

export default function DepositScreen() {
  const { token } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);

  const handleGenerateClabe = async () => {
    const n = parseFloat(amount.replace(',', '.'));
    if (!n || n < 10) {
      Alert.alert('Monto inválido', 'El mínimo de recarga es $10 MXN');
      return;
    }
    if (!token) return;

    setLoading(true);
    try {
      const res = await api.createDeposit(n, token);
      setDeposit(res);
      setDepositStatus('pending');
    } catch (e) {
      Alert.alert('Error al generar', 'No se pudo crear tu referencia de pago. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!deposit || !token) return;
    setChecking(true);
    try {
      const res = await api.getDepositStatus(deposit.deposit_id, token);
      setDepositStatus(res.status);
      if (res.status === 'completed') {
        Alert.alert(
          '¡Recarga exitosa!',
          `Se acreditaron $${fmtMXN(deposit.amount_mxn)} MXN a tu cartera. Ya puedes usarlos.`,
        );
      } else if (res.status === 'failed') {
        Alert.alert('Recarga fallida', 'Hubo un error al acreditar. Contacta soporte.');
      } else {
        Alert.alert('Pendiente', 'Aún no se detecta la transferencia. Intenta de nuevo en unos minutos.');
      }
    } catch (e) {
      Alert.alert('Error al verificar', 'No pudimos consultar el estado de tu recarga. Intenta de nuevo.');
    } finally {
      setChecking(false);
    }
  };

  const handleReset = () => {
    setDeposit(null);
    setAmount('');
    setDepositStatus(null);
  };

  const statusColor = () => {
    if (depositStatus === 'completed') return '#22c55e';
    if (depositStatus === 'failed') return '#ef4444';
    return '#f59e0b';
  };

  const statusLabel = () => {
    if (depositStatus === 'completed') return 'Completada';
    if (depositStatus === 'failed') return 'Fallida';
    return 'Pendiente';
  };

  if (deposit) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {depositStatus === 'completed' ? (
            <View style={styles.successCard}>
              <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
              <Text style={styles.successTitle}>¡Recarga confirmada!</Text>
              <Text style={styles.successSub}>{fmtMXN(deposit.amount_mxn)} MXNe acreditados</Text>
              <TouchableOpacity style={styles.btnOutline} onPress={handleReset}>
                <Text style={styles.btnOutlineText}>Nueva recarga</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Recarga por SPEI</Text>
              <Text style={styles.sub}>
                Realiza una transferencia bancaria al siguiente destino:
              </Text>

              {/* Card de CLABE */}
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.label}>Monto a transferir</Text>
                  <Text style={[styles.value, { color: Colors.primary, fontSize: 22, fontWeight: '800' }]}>
                    {fmtMXN(deposit.amount_mxn)}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.row}>
                  <Text style={styles.label}>Banco destino</Text>
                  <Text style={styles.value}>{deposit.bank_name}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>CLABE interbancaria</Text>
                  <Text style={[styles.value, styles.clabe]}>{deposit.clabe}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Referencia</Text>
                  <Text style={[styles.value, { fontFamily: 'monospace', fontSize: 12 }]}>
                    {deposit.deposit_id.slice(0, 8).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.row}>
                  <Text style={styles.label}>Estado</Text>
                  <Text style={[styles.value, { color: statusColor(), fontWeight: '700' }]}>
                    {statusLabel()}
                  </Text>
                </View>
              </View>

              {/* Instrucciones */}
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.infoText}>
                  Transfiere exactamente {fmtMXN(deposit.amount_mxn)} MXN desde tu app bancaria
                  a la CLABE mostrada. Tu saldo se acreditará automáticamente en minutos.
                </Text>
              </View>

              {/* Botón verificar */}
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleCheckStatus}
                disabled={checking}
              >
                <LinearGradient
                  colors={Gradients.blue}
                  style={styles.btnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {checking ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Verificar pago</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnSecondary} onPress={handleReset}>
                <Text style={styles.btnSecondaryText}>Cancelar / Nueva recarga</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Recargar saldo</Text>
        <Text style={styles.sub}>
          Ingresa el monto que quieres agregar a tu cartera. Te daremos los datos para hacer la transferencia desde tu banco.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Monto a recargar (MXN)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="Ej: 500"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={styles.hint}>Mínimo $10 MXN · Máximo $100,000 MXN</Text>
        </View>

        {/* Montos rápidos */}
        <View style={styles.quickRow}>
          {['100', '200', '500', '1000'].map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.quickBtn, amount === v && styles.quickBtnActive]}
              onPress={() => setAmount(v)}
            >
              <Text style={[styles.quickText, amount === v && { color: Colors.primary }]}>
                ${v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleGenerateClabe}
          disabled={loading}
        >
          <LinearGradient
            colors={Gradients.blue}
            style={styles.btnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Generar CLABE</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
          <Text style={styles.infoText}>
            Tu saldo se acredita automáticamente en minutos después de que tu banco envíe la transferencia.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.black },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.white, marginBottom: 6 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 18 },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 4 },
  value: { fontSize: 16, color: Colors.white, fontWeight: '600' },
  clabe: { fontSize: 18, fontFamily: 'monospace', letterSpacing: 1, color: Colors.primary },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 12 },
  row: { marginBottom: 12 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 14,
    fontSize: 20,
    color: Colors.white,
    fontWeight: '700',
    marginTop: 8,
  },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  quickBtnActive: { borderColor: Colors.primary },
  quickText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  btnPrimary: { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  btnGradient: { padding: 16, alignItems: 'center' },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  btnSecondary: { alignItems: 'center', paddingVertical: 10 },
  btnSecondaryText: { color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  btnOutline: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 16,
  },
  btnOutlineText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 18 },
  successCard: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
    gap: 12,
  },
  successTitle: { fontSize: 24, fontWeight: '800', color: Colors.white },
  successSub: { fontSize: 16, color: 'rgba(255,255,255,0.6)' },
});
