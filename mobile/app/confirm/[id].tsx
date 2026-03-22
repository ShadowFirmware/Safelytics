import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/context/AuthContext';
import { ApiError, api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors, Gradients } from '../../src/theme/colors';

type Intent = Awaited<ReturnType<typeof api.getPaymentInfo>>;
type Quote = Awaited<ReturnType<typeof api.getPaymentQuote>>;
type Result  = Awaited<ReturnType<typeof api.sendPayment>>;

export default function ConfirmScreen() {
  const { id }       = useLocalSearchParams<{ id: string }>();
  const { token }    = useAuth();
  const [intent,  setIntent]  = useState<Intent | null>(null);
  const [quote,   setQuote]   = useState<Quote | null>(null);
  const [result,  setResult]  = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying,  setPaying]  = useState(false);

  useEffect(() => {
    log.action('ConfirmarPago', 'Cargando datos del cobro…', { paymentId: id });
    let cancelled = false;
    (async () => {
      try {
        const [data, q] = await Promise.all([
          api.getPaymentInfo(id),
          api.getPaymentQuote(id).catch(() => null),
        ]);
        if (cancelled) return;
        setIntent(data);
        setQuote(q);
        log.action('ConfirmarPago', 'Detalle del cobro cargado', {
          merchant: data.merchant_name,
          amount_mxn: data.amount_mxn,
          status: data.status,
        });
      } catch (e) {
        if (cancelled) return;
        log.error('ConfirmarPago', e);
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Error';
        Alert.alert('Error', msg, [{ text: 'OK', onPress: () => router.back() }]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const pay = async () => {
    if (!token) return;
    setPaying(true);
    log.action('ConfirmarPago', 'Enviando pago…', { paymentId: id });
    try {
      const res = await api.sendPayment(id, token);
      log.action('ConfirmarPago', 'Pago enviado', {
        status: res.status,
        tx: res.stellar_tx_hash?.slice(0, 16) + '…',
      });
      setResult(res);
    } catch (e) {
      log.error('ConfirmarPago', e);
      Alert.alert('Pago fallido', e instanceof ApiError ? e.message : 'Intenta de nuevo');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  // ── Success screen ────────────────────────────────────────────────────────
  if (result) {
    return (
      <View style={styles.success}>
        <LinearGradient colors={Gradients.purple} style={styles.checkCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.checkIcon}>✓</Text>
        </LinearGradient>
        <Text style={styles.successTitle}>¡Pago listo!</Text>
        <Text style={styles.successAmount}>MXN ${result.amount_mxn.toFixed(2)}</Text>
        <Text style={styles.successSub}>El comercio recibió tu pago en pesos.</Text>

        <View style={styles.hashBox}>
          <Text style={styles.hashLabel}>ID de seguimiento (red Stellar)</Text>
          <Text style={styles.hashValue} selectable>
            {result.stellar_tx_hash.slice(0, 20)}...
          </Text>
        </View>

        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/customer')}>
          <LinearGradient colors={Gradients.blue} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={styles.btnText}>Volver al inicio</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  if (!intent) return null;

  // ── Confirm screen ────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Amount — hero */}
      <View style={styles.amountCard}>
        <Text style={styles.currencyLabel}>MXN</Text>
        <Text style={styles.amount}>${intent.amount_mxn.toFixed(2)}</Text>
        {intent.description && <Text style={styles.description}>{intent.description}</Text>}
      </View>

      {/* Merchant */}
      <View style={styles.merchantRow}>
        <View style={styles.merchantIcon}>
          <Text style={{ fontSize: 22 }}>🏪</Text>
        </View>
        <View>
          <Text style={styles.merchantLabel}>Comercio</Text>
          <Text style={styles.merchantName}>{intent.merchant_name}</Text>
        </View>
      </View>

      {quote ? (
        <View style={styles.quoteCard}>
          <Text style={styles.quoteTitle}>Resumen PagaLoop</Text>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteK}>Tú pagas</Text>
            <Text style={styles.quoteV}>${quote.customer_pays_mxn.toFixed(2)} MXN</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteK}>Comisión plataforma</Text>
            <Text style={styles.quoteV}>${quote.platform_fee_mxn.toFixed(2)} ({quote.platform_fee_bps / 100}%)</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteK}>Comercio recibe (estimado)</Text>
            <Text style={styles.quoteV}>${quote.merchant_receives_mxn.toFixed(2)} MXN</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteK}>Equiv. referencia USDC</Text>
            <Text style={styles.quoteV}>~{quote.stablecoin_reference_usdc.toFixed(4)} USDC</Text>
          </View>
          <Text style={styles.quoteFoot}>{quote.disclaimer_es}</Text>
        </View>
      ) : null}

      {/* Network badge */}
      <View style={styles.badge}>
        <View style={styles.dot} />
        <Text style={styles.badgeText}>PagaLoop · pagas en pesos · confirmación en segundos</Text>
      </View>

      <View style={{ flex: 1 }} />

      <TouchableOpacity style={styles.btn} onPress={pay} disabled={paying}>
        <LinearGradient colors={Gradients.blue} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          {paying
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.btnText}>Confirmar pago</Text>}
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.replace('/customer')}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.black },
  container:     { flexGrow: 1, padding: 24, backgroundColor: Colors.black },

  amountCard:    { backgroundColor: '#1A1A1A', borderRadius: 24, padding: 32, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 3 },
  currencyLabel: { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '500', marginBottom: 4 },
  amount:        { fontSize: 52, fontWeight: '800', color: Colors.white, letterSpacing: -2 },
  description:   { marginTop: 8, color: 'rgba(255,255,255,0.5)', fontSize: 14 },

  merchantRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, marginBottom: 16 },
  merchantIcon:  { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  merchantLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  merchantName:  { fontSize: 16, fontWeight: '700', color: Colors.white },

  badge:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  dot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, marginRight: 6 },
  badgeText:     { fontSize: 12, color: 'rgba(255,255,255,0.5)' },

  btn:           { borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  btnGradient:   { padding: 16, alignItems: 'center' },
  btnText:       { color: Colors.white, fontWeight: '700', fontSize: 16 },
  cancelBtn:     { alignItems: 'center', padding: 12 },
  cancelText:    { color: Colors.textLight, fontSize: 15 },

  // Success
  success:       { flex: 1, backgroundColor: Colors.black, justifyContent: 'center', alignItems: 'center', padding: 32 },
  checkCircle:   { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  checkIcon:     { color: Colors.white, fontSize: 48, fontWeight: '800' },
  successTitle:  { fontSize: 28, fontWeight: '800', color: Colors.white, marginBottom: 8 },
  successAmount: { fontSize: 22, fontWeight: '700', color: Colors.success, marginBottom: 8 },
  successSub:    { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 28, paddingHorizontal: 16 },
  hashBox:       { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, width: '100%', marginBottom: 32 },
  quoteCard:     { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  quoteTitle:    { fontSize: 14, fontWeight: '700', color: Colors.white, marginBottom: 12 },
  quoteRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quoteK:        { fontSize: 13, color: 'rgba(255,255,255,0.5)', flex: 1, paddingRight: 8 },
  quoteV:        { fontSize: 13, fontWeight: '600', color: Colors.white },
  quoteFoot:     { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 10, lineHeight: 14 },
  hashLabel:     { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  hashValue:     { fontFamily: 'monospace', fontSize: 13, color: Colors.white },
});
