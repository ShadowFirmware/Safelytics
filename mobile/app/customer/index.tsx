import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { TouchableOpacity, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Colors, Gradients } from '../../src/theme/colors';
import { log } from '../../src/utils/logger';

export default function CustomerHome() {
  const { logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pagar</Text>
        <TouchableOpacity onPress={async () => { await logout(); router.replace('/login'); }}>
          <Ionicons name="log-out-outline" size={24} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Botón centrado */}
        <View style={styles.center}>
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => {
              log.action('ClienteInicio', 'Abrir escáner QR');
              router.push('/scan');
            }}
            activeOpacity={0.85}
          >
            <LinearGradient colors={Gradients.blue} style={styles.scanBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="qr-code-outline" size={64} color={Colors.white} style={styles.scanIcon} />
              <Text style={styles.scanTitle}>Escanear y Pagar</Text>
              <Text style={styles.scanSub}>Apunta al QR del comercio</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Info — una sola card ancha */}
        <View style={styles.infoCard}>
          <View style={styles.infoCol}>
            <Ionicons name="flash-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoValue}>3s</Text>
            <Text style={styles.infoLabel} numberOfLines={1}>Instantáneo</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoCol}>
            <Ionicons name="link-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoValue}>Stellar</Text>
            <Text style={styles.infoLabel}>Red</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoCol}>
            <Ionicons name="cash-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoValue}>MXNe</Text>
            <Text style={styles.infoLabel}>Moneda</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.black },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.white },

  content:     { flex: 1, padding: 20, justifyContent: 'space-between' },
  center:      { flex: 1, justifyContent: 'center' },

  scanBtn:         { borderRadius: 24, overflow: 'hidden', shadowColor: Colors.primaryDark, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  scanBtnGradient: { paddingVertical: 48, alignItems: 'center' },
  scanIcon:    { marginBottom: 12 },
  scanTitle:   { color: Colors.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  scanSub:     { color: 'rgba(255,255,255,0.75)', fontSize: 14 },

  infoCard:    { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 16, paddingVertical: 16 },
  infoCol:     { width: '33.33%', alignItems: 'center', justifyContent: 'center', gap: 4 },
  infoDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.1)' },
  infoValue:   { fontSize: 14, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  infoLabel:   { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
});
