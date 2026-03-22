import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl,
  SafeAreaView, StyleSheet, Text, View,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/services/api';
import { log } from '../../src/utils/logger';
import { Colors } from '../../src/theme/colors';

type Tx = Awaited<ReturnType<typeof api.getHistory>>[number];

export default function MerchantHistory() {
  const { token }  = useAuth();
  const [items,    setItems]    = useState<Tx[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [todayTotal, setToday]  = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    log.action('MerchantHistory', 'Cargando historial de cobros…');
    try {
      const data  = await api.getHistory(token);
      const today = new Date().toISOString().slice(0, 10);
      const total = data
        .filter((tx) => tx.created_at.startsWith(today) && ['submitted','confirmed'].includes(tx.status))
        .reduce((s, tx) => s + tx.amount_mxn, 0);
      setItems(data);
      setToday(total);
      log.action('MerchantHistory', 'Historial cargado', { count: data.length, totalHoy: total });
    } catch (e) {
      log.error('MerchantHistory', e);
    }
    setLoading(false);
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.success} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Historial de cobros</Text>
      <FlatList
        data={items}
        keyExtractor={(tx) => tx.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListHeaderComponent={
          <View style={styles.todayCard}>
            <Text style={styles.todayLabel}>Cobrado hoy</Text>
            <Text style={styles.todayAmount}>MXN ${todayTotal.toFixed(2)}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💰</Text>
            <Text style={styles.emptyText}>Sin cobros aún</Text>
          </View>
        }
        renderItem={({ item: tx }) => (
          <View style={styles.card}>
            <Text style={styles.arrow}>↓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.amount}>MXN ${tx.amount_mxn.toFixed(2)}</Text>
              {tx.stellar_tx_hash && (
                <Text style={styles.hash} numberOfLines={1}>
                  {tx.stellar_tx_hash.slice(0, 16)}…
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.status, { color: tx.status === 'failed' ? Colors.error : Colors.success }]}>
                {tx.status}
              </Text>
              <Text style={styles.date}>{tx.created_at.slice(0, 10)}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.black },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.black },
  title:       { fontSize: 22, fontWeight: '800', color: Colors.white, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  todayCard:   { backgroundColor: Colors.success + '22', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: Colors.success + '44' },
  todayLabel:  { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 },
  todayAmount: { fontSize: 24, fontWeight: '800', color: Colors.success },
  card:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 14, padding: 14, gap: 10 },
  arrow:       { fontSize: 18, color: Colors.success, fontWeight: '800' },
  amount:      { fontSize: 15, fontWeight: '700', color: Colors.white },
  hash:        { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  status:      { fontSize: 11, fontWeight: '600' },
  date:        { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  empty:       { alignItems: 'center', marginTop: 60 },
  emptyIcon:   { fontSize: 48, marginBottom: 10 },
  emptyText:   { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
});
