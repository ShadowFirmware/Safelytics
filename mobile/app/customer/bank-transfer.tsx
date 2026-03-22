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

type TransferResult = {
  transfer_id: string;
  stellar_tx_hash: string;
  amount_mxn: number;
  destination_clabe: string;
  status: string;
};

export default function BankTransferScreen() {
  const { token } = useAuth();
  const [clabe, setClabe] = useState('');
  const [holderName, setHolderName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);

  const isValidClabe = (c: string) => c.length === 18 && /^\d+$/.test(c);

  const handleTransfer = async () => {
    if (!isValidClabe(clabe)) {
      Alert.alert('CLABE inválida', 'La CLABE debe tener exactamente 18 dígitos numéricos.');
      return;
    }
    if (!holderName.trim()) {
      Alert.alert('Falta dato', 'Ingresa el nombre del titular de la cuenta.');
      return;
    }
    const n = parseFloat(amount.replace(',', '.'));
    if (!n || n < 1) {
      Alert.alert('Monto inválido', 'El monto mínimo es $1 MXN.');
      return;
    }
    if (!token) return;

    Alert.alert(
      'Confirmar transferencia',
      `¿Enviar ${fmtMXN(n)} MXN a la cuenta:\n\n${holderName.trim()}\nCLABE: ${clabe}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'destructive',
          onPress: () => executeTransfer(n),
        },
      ],
    );
  };

  const executeTransfer = async (n: number) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.bankTransfer(
        {
          destination_clabe: clabe,
          holder_name: holderName.trim(),
          amount_mxn: n,
          description: description.trim() || undefined,
        },
        token,
      );
      setResult(res);
    } catch (e) {
      Alert.alert('Error al transferir', 'No se pudo enviar la transferencia. Verifica tu saldo e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setClabe('');
    setHolderName('');
    setAmount('');
    setDescription('');
  };

  if (result) {
    const isOk = result.status === 'processing' || result.status === 'completed';
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.resultCard}>
            <Ionicons
              name={isOk ? 'checkmark-circle' : 'warning'}
              size={64}
              color={isOk ? '#22c55e' : '#f59e0b'}
            />
            <Text style={styles.resultTitle}>
              {isOk ? 'Transferencia iniciada' : 'Revisión requerida'}
            </Text>
            <Text style={styles.resultSub}>
              {isOk
                ? `Se están transfiriendo ${fmtMXN(result.amount_mxn)} MXN vía SPEI.`
                : 'El MXNe fue deducido pero hubo un error con el pago SPEI. Contacta soporte.'}
            </Text>

            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Monto</Text>
                <Text style={styles.detailValue}>{fmtMXN(result.amount_mxn)} MXN</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>CLABE destino</Text>
                <Text style={[styles.detailValue, styles.monoText]}>{result.destination_clabe}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Estado</Text>
                <Text style={[styles.detailValue, { color: isOk ? '#22c55e' : '#f59e0b' }]}>
                  {isOk ? 'En proceso (SPEI 24h)' : 'Error en payout'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Folio</Text>
                <Text style={[styles.detailValue, styles.monoText]}>
                  {result.transfer_id.slice(0, 8).toUpperCase()}
                </Text>
              </View>
            </View>

            {isOk && (
              <View style={styles.infoBox}>
                <Ionicons name="time-outline" size={16} color={Colors.primary} />
                <Text style={styles.infoText}>
                  Las transferencias SPEI se procesan en máx. 24 horas hábiles.
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.btnOutline} onPress={handleReset}>
              <Text style={styles.btnOutlineText}>Nueva transferencia</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Transferencia bancaria</Text>
        <Text style={styles.sub}>
          Envía MXN desde tu cartera directamente a cualquier cuenta bancaria mexicana.
        </Text>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>CLABE interbancaria (18 dígitos)</Text>
          <TextInput
            style={[styles.input, clabe.length > 0 && !isValidClabe(clabe) && styles.inputError]}
            keyboardType="number-pad"
            placeholder="000000000000000000"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={clabe}
            onChangeText={(t) => setClabe(t.replace(/\D/g, '').slice(0, 18))}
            maxLength={18}
          />
          {clabe.length > 0 && !isValidClabe(clabe) && (
            <Text style={styles.errorText}>{clabe.length}/18 dígitos</Text>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Nombre del titular</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Juan García López"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={holderName}
            onChangeText={setHolderName}
            autoCapitalize="words"
          />

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Monto (MXN)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={amount}
            onChangeText={setAmount}
          />

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Concepto (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Pago de renta"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Aviso */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.infoText}>
            Tu saldo se descontará de inmediato. El destinatario recibirá el dinero en su cuenta bancaria en máx. 24 horas hábiles.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleTransfer}
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
              <View style={styles.btnContent}>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.btnText}>Enviar transferencia</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
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
  fieldLabel: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.white,
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 4 },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 18 },
  btnPrimary: { borderRadius: 14, overflow: 'hidden' },
  btnGradient: { padding: 16, alignItems: 'center' },
  btnContent: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  // Result screen
  resultCard: { alignItems: 'center', paddingTop: 40, paddingBottom: 40, gap: 12 },
  resultTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  resultSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  detailCard: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 8,
    gap: 12,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  detailValue: { fontSize: 14, color: Colors.white, fontWeight: '600' },
  monoText: { fontFamily: 'monospace', fontSize: 12 },
  btnOutline: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  btnOutlineText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },
});
