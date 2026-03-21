import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, SafeAreaView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../src/context/AuthContext';
import { ApiError, api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors } from '../../src/theme/colors';

const QR_SCHEME = 'safelytics://pay/';

export default function GenerateQrScreen() {
  const { token } = useAuth();
  const [amount,  setAmount]  = useState('');
  const [desc,    setDesc]    = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const generate = async () => {
    const mxn = parseFloat(amount.replace(',', '.'));
    if (!mxn || mxn <= 0) {
      Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0');
      return;
    }
    if (!token) return;
    setLoading(true);
    log.action('GenerarQR', 'Solicitando QR de cobro', { amount_mxn: mxn, hasDescription: Boolean(desc) });
    try {
      const res = await api.generateQr({ amount_mxn: mxn, description: desc || undefined }, token);
      log.action('GenerarQR', 'QR listo', { payment_id: res.payment_id });
      setPaymentId(res.payment_id);
    } catch (e) {
      log.error('GenerarQR', e);
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Intenta de nuevo');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPaymentId(null);
    setAmount('');
    setDesc('');
  };

  // ── QR display ────────────────────────────────────────────────────────────
  if (paymentId) {
    const qrData = `${QR_SCHEME}${paymentId}`;
    const mxn    = parseFloat(amount.replace(',', '.'));
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.qrContainer}>
          <Text style={styles.qrAmount}>MXN ${mxn.toFixed(2)}</Text>
          {desc ? <Text style={styles.qrDesc}>{desc}</Text> : null}

          <View style={styles.qrBox}>
            <QRCode value={qrData} size={240} backgroundColor={Colors.white} color={Colors.textDark} />
          </View>

          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeTxt}>Válido 10 minutos</Text>
          </View>

          <TouchableOpacity style={styles.btn} onPress={reset}>
            <Text style={styles.btnText}>+ Nuevo cobro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.form}>
          <Text style={styles.formTitle}>¿Cuánto vas a cobrar?</Text>

          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={Colors.textLight}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />
          <Text style={styles.currencyHint}>pesos MXN</Text>

          <TextInput
            style={styles.descInput}
            placeholder="Concepto (opcional)"
            placeholderTextColor={Colors.textLight}
            autoCapitalize="sentences"
            value={desc}
            onChangeText={setDesc}
            onSubmitEditing={generate}
          />

          <TouchableOpacity style={styles.btn} onPress={generate} disabled={loading}>
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.btnText}>Generar QR</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.surface },

  form:         { flex: 1, padding: 24, justifyContent: 'center' },
  formTitle:    { fontSize: 22, fontWeight: '800', color: Colors.textDark, marginBottom: 24, textAlign: 'center' },
  amountInput:  { fontSize: 48, fontWeight: '800', textAlign: 'center', color: Colors.textDark, borderBottomWidth: 2, borderBottomColor: Colors.primary, paddingBottom: 8, marginBottom: 4 },
  currencyHint: { textAlign: 'center', color: Colors.textLight, marginBottom: 24, fontSize: 14 },
  descInput:    { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 24, color: Colors.textDark },
  btn:          { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  btnText:      { color: Colors.white, fontWeight: '700', fontSize: 16 },

  qrContainer:  { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  qrAmount:     { fontSize: 36, fontWeight: '800', color: Colors.textDark },
  qrDesc:       { color: Colors.textLight, fontSize: 14 },
  qrBox:        { backgroundColor: Colors.white, borderRadius: 24, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 4 },
  activeBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  activeTxt:    { color: Colors.textLight, fontSize: 13 },
});
