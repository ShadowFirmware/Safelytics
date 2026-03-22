import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Gradients } from '../../src/theme/colors';

const STORE_KEY = 'safelytics_sales_entries';

interface SalesEntry {
  id: string;
  timestamp: string;
  totalSales: number;
  cashAmount: number;
}

function fmt(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
}

function hourLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

interface DayGroup {
  dayKey: string;
  entries: SalesEntry[];
}
interface MonthGroup {
  monthKey: string;
  days: DayGroup[];
}

function groupEntries(entries: SalesEntry[]): MonthGroup[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const months: MonthGroup[] = [];
  for (const entry of sorted) {
    const mk = monthKey(entry.timestamp);
    const dk = dayKey(entry.timestamp);

    let month = months.find((m) => m.monthKey === mk);
    if (!month) {
      month = { monthKey: mk, days: [] };
      months.push(month);
    }
    let day = month.days.find((d) => d.dayKey === dk);
    if (!day) {
      day = { dayKey: dk, entries: [] };
      month.days.push(day);
    }
    day.entries.push(entry);
  }
  return months;
}

async function loadEntries(): Promise<SalesEntry[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    return raw ? (JSON.parse(raw) as SalesEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveEntries(entries: SalesEntry[]) {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(entries));
}

export default function Terminal() {
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [salesInput, setSalesInput] = useState('');
  const [cashInput, setCashInput] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadEntries().then(setEntries);
    }, []),
  );

  const handleAdd = async () => {
    const totalSales = parseFloat(salesInput.replace(',', '.'));
    const cashAmount = parseFloat(cashInput.replace(',', '.'));

    if (isNaN(totalSales) || totalSales < 0) {
      Alert.alert('Error', 'Ingresa un total de ventas válido.');
      return;
    }
    if (isNaN(cashAmount) || cashAmount < 0) {
      Alert.alert('Error', 'Ingresa un monto de efectivo válido.');
      return;
    }

    setSaving(true);
    const entry: SalesEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      totalSales,
      cashAmount,
    };
    const updated = [entry, ...entries];
    await saveEntries(updated);
    setEntries(updated);
    setSalesInput('');
    setCashInput('');
    setSaving(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Eliminar registro', '¿Seguro que deseas eliminar este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const updated = entries.filter((e) => e.id !== id);
          await saveEntries(updated);
          setEntries(updated);
        },
      },
    ]);
  };

  const groups = groupEntries(entries);
  const totalVentas = entries.reduce((s, e) => s + e.totalSales, 0);
  const totalEfectivo = entries.reduce((s, e) => s + e.cashAmount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Terminal de ventas</Text>
            <Text style={styles.headerSub}>
              {new Date().toLocaleDateString('es-MX', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total ventas</Text>
              <Text style={styles.summaryValue}>{fmt(totalVentas)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total efectivo</Text>
              <Text style={[styles.summaryValue, styles.summaryValueCash]}>{fmt(totalEfectivo)}</Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Registrar corte</Text>
            <Text style={styles.fieldLabel}>Ventas totales (MXN)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="rgba(255,255,255,0.35)"
              keyboardType="decimal-pad"
              value={salesInput}
              onChangeText={setSalesInput}
            />
            <Text style={styles.fieldLabel}>Efectivo (MXN)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="rgba(255,255,255,0.35)"
              keyboardType="decimal-pad"
              value={cashInput}
              onChangeText={setCashInput}
            />
            <Pressable
              style={[styles.btn, saving && styles.btnDisabled]}
              onPress={handleAdd}
              disabled={saving}
            >
              <LinearGradient colors={Gradients.purple} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.btnText}>{saving ? 'Guardando…' : 'Registrar'}</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Historial</Text>

          {groups.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={48} color="rgba(255,255,255,0.2)" style={{ marginBottom: 10 }} />
              <Text style={styles.emptyText}>Sin registros aún{'\n'}Agrega tu primer corte</Text>
            </View>
          ) : (
            groups.map((month) => (
              <View key={month.monthKey}>
                <Text style={styles.monthLabel}>{month.monthKey}</Text>
                {month.days.map((day) => {
                  const dayVentas = day.entries.reduce((s, e) => s + e.totalSales, 0);
                  const dayEfectivo = day.entries.reduce((s, e) => s + e.cashAmount, 0);

                  return (
                    <View key={day.dayKey} style={styles.dayCard}>
                      <View style={styles.dayHeader}>
                        <Text style={styles.dayTitle}>{day.dayKey}</Text>
                        <View style={styles.dayTotals}>
                          <Text style={styles.dayTotalLine}>Ventas {fmt(dayVentas)}</Text>
                          <Text style={styles.dayTotalCash}>Efectivo {fmt(dayEfectivo)}</Text>
                        </View>
                      </View>
                      {day.entries.map((entry) => (
                        <Pressable
                          key={entry.id}
                          style={styles.entryRow}
                          onLongPress={() => handleDelete(entry.id)}
                        >
                          <Text style={styles.entryHour}>{hourLabel(entry.timestamp)}</Text>
                          <View style={styles.entryValues}>
                            <Text style={styles.entryVentas}>{fmt(entry.totalSales)}</Text>
                            <Text style={styles.entryCash}>{fmt(entry.cashAmount)} ef.</Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>
            ))
          )}

          <Text style={styles.hint}>Mantén presionado un registro para eliminarlo</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.black },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  header: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  summaryValue: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  summaryValueCash: {
    color: Colors.warning,
  },

  formCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 14,
    color: Colors.white,
  },
  btn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  btnGradient: {
    padding: 16,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.65,
  },
  btnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 12,
  },

  empty: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },

  monthLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'capitalize',
    marginBottom: 10,
    marginTop: 8,
  },

  dayCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  dayTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
    textTransform: 'capitalize',
    flex: 1,
    paddingRight: 8,
  },
  dayTotals: { alignItems: 'flex-end', gap: 2 },
  dayTotalLine: { fontSize: 12, fontWeight: '600', color: Colors.success },
  dayTotalCash: { fontSize: 12, fontWeight: '600', color: Colors.warning },

  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  entryHour: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    width: 56,
    fontWeight: '500',
  },
  entryValues: { flexDirection: 'row', gap: 16 },
  entryVentas: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  entryCash: {
    color: Colors.warning,
    fontSize: 14,
    fontWeight: '600',
  },

  hint: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    marginTop: 16,
    lineHeight: 18,
  },
});
