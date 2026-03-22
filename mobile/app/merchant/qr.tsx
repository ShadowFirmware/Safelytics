import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, SafeAreaView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../src/context/AuthContext';
import { ApiError, api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors, Gradients } from '../../src/theme/colors';
import { fmtMXN } from '../../src/utils/format';

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
          <Text style={styles.qrAmount}>MXN ${fmtMXN(mxn)}</Text>
          {desc ? <Text style={styles.qrDesc}>{desc}</Text> : null}

          <View style={styles.qrBox}>
            <QRCode value={qrData} size={240} backgroundColor={Colors.white} color={Colors.textDark} />
          </View>

          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeTxt}>Válido 10 minutos</Text>
          </View>

          <TouchableOpacity style={styles.btn} onPress={reset}>
            <LinearGradient colors={Gradients.blue} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.btnText}>+ Nuevo cobro</Text>
            </LinearGradient>
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
            placeholderTextColor="rgba(255,255,255,0.35)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />
          <Text style={styles.currencyHint}>pesos MXN</Text>

          <TextInput
            style={styles.descInput}
            placeholder="Concepto (opcional)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="sentences"
            value={desc}
            onChangeText={setDesc}
            onSubmitEditing={generate}
          />

          <TouchableOpacity style={styles.btn} onPress={generate} disabled={loading}>
            <LinearGradient colors={Gradients.blue} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.btnText}>Generar QR</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.black },

  form:         { flex: 1, padding: 24, justifyContent: 'center' },
  formTitle:    { fontSize: 22, fontWeight: '800', color: Colors.white, marginBottom: 24, textAlign: 'center' },
  amountInput:  { fontSize: 48, fontWeight: '800', textAlign: 'center', color: Colors.white, borderBottomWidth: 2, borderBottomColor: Colors.primary, paddingBottom: 8, marginBottom: 4 },
  currencyHint: { textAlign: 'center', color: 'rgba(255,255,255,0.5)', marginBottom: 24, fontSize: 14 },
  descInput:    { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 24, color: Colors.white },
  btn:          { borderRadius: 12, overflow: 'hidden' },
  btnGradient:  { padding: 16, alignItems: 'center' },
  btnText:      { color: Colors.white, fontWeight: '700', fontSize: 16 },

  qrContainer:  { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  qrAmount:     { fontSize: 36, fontWeight: '800', color: Colors.white },
  qrDesc:       { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  qrBox:        { backgroundColor: '#1A1A1A', borderRadius: 24, padding: 20, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 4 },
  activeBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  activeTxt:    { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
});
