import { router } from 'expo-router';
import { TouchableOpacity, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Colors } from '../../src/theme/colors';
import { log } from '../../src/utils/logger';

export default function CustomerHome() {
  const { logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PagaLoop</Text>
        <TouchableOpacity onPress={async () => { await logout(); router.replace('/login'); }}>
          <Text style={styles.logoutIcon}>⎋</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Big scan button */}
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => {
            log.action('ClienteInicio', 'Abrir escáner QR');
            router.push('/scan');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.scanIcon}>📷</Text>
          <Text style={styles.scanTitle}>Escanear y Pagar</Text>
          <Text style={styles.scanSub}>Apunta al QR del comercio</Text>
        </TouchableOpacity>

        {/* Info cards */}
        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardIcon}>⚡</Text>
            <Text style={styles.cardLabel}>Pago instantáneo</Text>
            <Text style={styles.cardValue}>~3 segundos</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardIcon}>🔗</Text>
            <Text style={styles.cardLabel}>Red</Text>
            <Text style={styles.cardValue}>Stellar</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardIcon}>💵</Text>
            <Text style={styles.cardLabel}>Moneda</Text>
            <Text style={styles.cardValue}>MXNe</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: Colors.surface },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.textDark },
  logoutIcon: { fontSize: 22, color: Colors.textLight },

  content:    { flex: 1, padding: 20 },

  scanBtn:    {
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 48,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    marginBottom: 24,
  },
  scanIcon:   { fontSize: 60, marginBottom: 12 },
  scanTitle:  { color: Colors.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  scanSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 14 },

  cards:      { flexDirection: 'row', gap: 10 },
  card:       { flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 16, alignItems: 'center' },
  cardIcon:   { fontSize: 24, marginBottom: 6 },
  cardLabel:  { fontSize: 11, color: Colors.textLight, marginBottom: 2 },
  cardValue:  { fontSize: 13, fontWeight: '700', color: Colors.textDark },
});
