import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { ApiError, api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors } from '../../src/theme/colors';

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
        <View style={styles.checkCircle}>
          <Text style={styles.checkIcon}>✓</Text>
        </View>
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
          <Text style={styles.btnText}>Volver al inicio</Text>
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
        {paying
          ? <ActivityIndicator color={Colors.white} />
          : <Text style={styles.btnText}>Confirmar pago</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.replace('/customer')}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container:     { flexGrow: 1, padding: 24, backgroundColor: Colors.surface },

  amountCard:    { backgroundColor: Colors.white, borderRadius: 24, padding: 32, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 20, elevation: 3 },
  currencyLabel: { fontSize: 14, color: Colors.textLight, fontWeight: '500', marginBottom: 4 },
  amount:        { fontSize: 52, fontWeight: '800', color: Colors.textDark, letterSpacing: -2 },
  description:   { marginTop: 8, color: Colors.textLight, fontSize: 14 },

  merchantRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16 },
  merchantIcon:  { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  merchantLabel: { fontSize: 12, color: Colors.textLight },
  merchantName:  { fontSize: 16, fontWeight: '700', color: Colors.textDark },

  badge:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  dot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, marginRight: 6 },
  badgeText:     { fontSize: 12, color: Colors.textLight },

  btn:           { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnText:       { color: Colors.white, fontWeight: '700', fontSize: 16 },
  cancelBtn:     { alignItems: 'center', padding: 12 },
  cancelText:    { color: Colors.textLight, fontSize: 15 },

  // Success
  success:       { flex: 1, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', padding: 32 },
  checkCircle:   { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.success, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  checkIcon:     { color: Colors.white, fontSize: 48, fontWeight: '800' },
  successTitle:  { fontSize: 28, fontWeight: '800', color: Colors.textDark, marginBottom: 8 },
  successAmount: { fontSize: 22, fontWeight: '700', color: Colors.success, marginBottom: 8 },
  successSub:    { fontSize: 14, color: Colors.textLight, textAlign: 'center', marginBottom: 28, paddingHorizontal: 16 },
  hashBox:       { backgroundColor: Colors.white, borderRadius: 12, padding: 16, width: '100%', marginBottom: 32 },
  quoteCard:     { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  quoteTitle:    { fontSize: 14, fontWeight: '700', color: Colors.textDark, marginBottom: 12 },
  quoteRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quoteK:        { fontSize: 13, color: Colors.textLight, flex: 1, paddingRight: 8 },
  quoteV:        { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  quoteFoot:     { fontSize: 10, color: Colors.textLight, marginTop: 10, lineHeight: 14 },
  hashLabel:     { fontSize: 12, color: Colors.textLight, marginBottom: 4 },
  hashValue:     { fontFamily: 'monospace', fontSize: 13, color: Colors.textDark },
});
