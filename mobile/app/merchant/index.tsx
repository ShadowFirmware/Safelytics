import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl,
  SafeAreaView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/context/AuthContext';
import { ApiError, api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors, Gradients } from '../../src/theme/colors';
import { fmtMXN } from '../../src/utils/format';

type Balance = Awaited<ReturnType<typeof api.getMerchantBalance>>;
type Tx      = Awaited<ReturnType<typeof api.getHistory>>[number];

export default function MerchantHome() {
  const { token, logout } = useAuth();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [recent,  setRecent]  = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    log.action('MerchantHome', 'Cargando balance e historial…');
    try {
      const [bal, txs] = await Promise.all([
        api.getMerchantBalance(token),
        api.getHistory(token),
      ]);
      setBalance(bal);
      setRecent(txs.slice(0, 4));
      log.action('MerchantHome', 'Datos cargados', {
        mxne_balance: bal.mxne_balance,
        historialCount: txs.length,
      });
    } catch (e) {
      log.error('MerchantHome', e);
    }
    setLoading(false);
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onBootstrap = async () => {
    if (!token) return;
    try {
      await api.bootstrapTestnet(token);
      Alert.alert('¡Listo!', 'Tu cartera ya está activa y lista para recibir cobros.');
      load();
    } catch (e) {
      Alert.alert('No se pudo activar', 'Hubo un problema al configurar tu cartera. Intenta de nuevo.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi negocio</Text>
        <TouchableOpacity onPress={async () => { await logout(); router.replace('/login'); }}>
          <Ionicons name="log-out-outline" size={22} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {loading
        ? <View style={styles.center}><ActivityIndicator color={Colors.success} /></View>
        : (
          <FlatList
            data={recent}
            keyExtractor={(tx) => tx.id}
            contentContainerStyle={{ padding: 20, gap: 10 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
            ListHeaderComponent={
              <>
                {/* Balance card */}
                <LinearGradient colors={Gradients.purple} style={styles.balanceCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Text style={styles.balanceLabel}>Saldo MXNe</Text>
                  <Text style={styles.balanceAmount}>
                    {balance ? `MXN $${fmtMXN(balance.mxne_balance)}` : '—'}
                  </Text>
                  <Text style={styles.balanceSub}>Red Stellar · casi inmediato</Text>
                </LinearGradient>

                {/* Bootstrap */}
                <TouchableOpacity style={styles.cobraBtn} onPress={onBootstrap}>
                  <LinearGradient colors={Gradients.purple} style={styles.cobraBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={styles.cobraBtnText}>Activar wallet (primera vez)</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Quick action */}
                <TouchableOpacity style={styles.cobraBtn} onPress={() => router.push('/merchant/qr')}>
                  <LinearGradient colors={Gradients.blue} style={styles.cobraBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={styles.cobraBtnText}>Generar cobro</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {recent.length > 0 && <Text style={styles.sectionTitle}>Cobros recientes</Text>}
              </>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="cash-outline" size={48} color="rgba(255,255,255,0.2)" style={{ marginBottom: 10 }} />
                <Text style={styles.emptyText}>Genera tu primer cobro</Text>
              </View>
            }
            renderItem={({ item: tx }) => (
              <View style={styles.txCard}>
                <Ionicons name="arrow-down-outline" size={20} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.txAmount}>MXN ${fmtMXN(tx.amount_mxn)}</Text>
                  <Text style={styles.txDate}>{tx.created_at.slice(0, 10)}</Text>
                </View>
                <Text style={{ color: tx.status === 'failed' ? Colors.error : Colors.success, fontWeight: '600', fontSize: 12 }}>
                  {tx.status === 'failed' ? 'Cobro fallido' : tx.status === 'submitted' ? 'Cobro exitoso' : tx.status === 'pending' ? 'Pendiente' : 'Completado'}
                </Text>
              </View>
            )}
          />
        )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.black },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.black },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitle:  { fontSize: 20, fontWeight: '800', color: Colors.white },

  balanceCard:  { borderRadius: 24, padding: 28,
                  shadowColor: Colors.successDark, shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6, marginBottom: 14 },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  balanceAmount: { color: Colors.white, fontSize: 38, fontWeight: '800', letterSpacing: -1, marginBottom: 4 },
  balanceSub:   { color: 'rgba(255,255,255,0.65)', fontSize: 12 },

  cobraBtn:         { borderRadius: 14, overflow: 'hidden', marginBottom: 24 },
  cobraBtnGradient: { padding: 16, alignItems: 'center' },
  cobraBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.white, marginBottom: 4 },

  txCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 14, padding: 14, gap: 12 },
  txAmount:{ fontSize: 16, fontWeight: '700', color: Colors.white },
  txDate:  { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  empty:     { alignItems: 'center', marginTop: 40 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
});
