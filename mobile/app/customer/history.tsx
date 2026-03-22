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
import { fmtMXN } from '../../src/utils/format';

type Tx = Awaited<ReturnType<typeof api.getHistory>>[number];

const STATUS_COLOR: Record<string, string> = {
  submitted: Colors.success,
  confirmed: Colors.success,
  failed:    Colors.error,
  pending:   Colors.warning,
};

export default function CustomerHistory() {
  const { token }   = useAuth();
  const [items,    setItems]    = useState<Tx[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    log.action('CustomerHistory', 'Cargando historial de pagos…');
    try {
      const data = await api.getHistory(token);
      setItems(data);
      log.action('CustomerHistory', 'Historial cargado', { count: data.length });
    } catch (e) {
      log.error('CustomerHistory', e);
    }
    setLoading(false);
    setRefresh(false);
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Historial</Text>
      <FlatList
        data={items}
        keyExtractor={(tx) => tx.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyText}>Sin pagos aún</Text>
          </View>
        }
        renderItem={({ item: tx }) => (
          <View style={styles.card}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[tx.status] ?? Colors.warning }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.amount}>MXN ${fmtMXN(tx.amount_mxn)}</Text>
              <Text style={styles.date}>{tx.created_at.slice(0, 10)}</Text>
            </View>
            <Text style={[styles.status, { color: STATUS_COLOR[tx.status] ?? Colors.warning }]}>
              {tx.status}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.black },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.black },
  title:  { fontSize: 22, fontWeight: '800', color: Colors.white, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  list:   { padding: 16, gap: 8 },
  card:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, gap: 12 },
  dot:    { width: 10, height: 10, borderRadius: 5 },
  amount: { fontSize: 16, fontWeight: '700', color: Colors.white },
  date:   { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  status: { fontSize: 12, fontWeight: '600' },
  empty:  { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
});
