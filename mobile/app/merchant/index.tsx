import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl,
  SafeAreaView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors } from '../../src/theme/colors';

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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi negocio</Text>
        <TouchableOpacity onPress={async () => { await logout(); router.replace('/login'); }}>
          <Text style={styles.logoutIcon}>⎋</Text>
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
                <View style={styles.balanceCard}>
                  <Text style={styles.balanceLabel}>Saldo MXNe</Text>
                  <Text style={styles.balanceAmount}>
                    {balance ? `MXN $${balance.mxne_balance.toFixed(2)}` : '—'}
                  </Text>
                  <Text style={styles.balanceSub}>Red Stellar · casi inmediato</Text>
                </View>

                {/* Quick action */}
                <TouchableOpacity style={styles.cobraBtn} onPress={() => router.push('/merchant/qr')}>
                  <Text style={styles.cobraBtnText}>+ Generar cobro</Text>
                </TouchableOpacity>

                {recent.length > 0 && <Text style={styles.sectionTitle}>Cobros recientes</Text>}
              </>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>💰</Text>
                <Text style={styles.emptyText}>Genera tu primer cobro</Text>
              </View>
            }
            renderItem={({ item: tx }) => (
              <View style={styles.txCard}>
                <Text style={styles.txArrow}>↓</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txAmount}>MXN ${tx.amount_mxn.toFixed(2)}</Text>
                  <Text style={styles.txDate}>{tx.created_at.slice(0, 10)}</Text>
                </View>
                <Text style={{ color: tx.status === 'failed' ? Colors.error : Colors.success, fontWeight: '600', fontSize: 12 }}>
                  {tx.status}
                </Text>
              </View>
            )}
          />
        )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.surface },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitle:  { fontSize: 20, fontWeight: '800', color: Colors.textDark },
  logoutIcon:   { fontSize: 22, color: Colors.textLight },

  balanceCard:  { borderRadius: 24, padding: 28,
                  backgroundColor: Colors.success,
                  shadowColor: Colors.success, shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6, marginBottom: 14 },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  balanceAmount: { color: Colors.white, fontSize: 38, fontWeight: '800', letterSpacing: -1, marginBottom: 4 },
  balanceSub:   { color: 'rgba(255,255,255,0.65)', fontSize: 12 },

  cobraBtn:     { backgroundColor: Colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 24 },
  cobraBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },

  txCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 12 },
  txArrow: { fontSize: 20, color: Colors.success, fontWeight: '700' },
  txAmount:{ fontSize: 16, fontWeight: '700', color: Colors.textDark },
  txDate:  { fontSize: 12, color: Colors.textLight, marginTop: 2 },

  empty:     { alignItems: 'center', marginTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 10 },
  emptyText: { color: Colors.textLight, fontSize: 16 },
});
