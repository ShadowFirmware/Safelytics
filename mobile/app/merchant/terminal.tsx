import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors } from '../../src/theme/colors';

const STORE_KEY = 'safelytics_sales_entries';

interface SalesEntry {
  id: string;
  timestamp: string; // ISO string
  totalSales: number;
  cashAmount: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

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

// ─── group entries: month → day → list ──────────────────────────────────────

interface DayGroup   { dayKey: string; entries: SalesEntry[] }
interface MonthGroup { monthKey: string; days: DayGroup[] }

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

// ─── storage ────────────────────────────────────────────────────────────────

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

// ─── component ──────────────────────────────────────────────────────────────

export default function Terminal() {
  const [entries,    setEntries]    = useState<SalesEntry[]>([]);
  const [salesInput, setSalesInput] = useState('');
  const [cashInput,  setCashInput]  = useState('');
  const [saving,     setSaving]     = useState(false);

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

  // summary totals
  const totalVentas  = entries.reduce((s, e) => s + e.totalSales, 0);
  const totalEfectivo = entries.reduce((s, e) => s + e.cashAmount, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── header terminal ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>▌ TERMINAL DE VENTAS</Text>
          <Text style={styles.headerSub}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </Text>
        </View>

        {/* ── summary banner ── */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total ventas</Text>
            <Text style={styles.summaryValue}>{fmt(totalVentas)}</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: Colors.warning + '66' }]}>
            <Text style={styles.summaryLabel}>Total efectivo</Text>
            <Text style={[styles.summaryValue, { color: Colors.warning }]}>{fmt(totalEfectivo)}</Text>
          </View>
        </View>

        {/* ── input form ── */}
        <View style={styles.form}>
          <View style={styles.inputRow}>
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>VENTAS TOTALES (MXN)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={salesInput}
                onChangeText={setSalesInput}
              />
            </View>
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>EFECTIVO (MXN)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={cashInput}
                onChangeText={setCashInput}
              />
            </View>
          </View>
          <Pressable
            style={[styles.btn, saving && { opacity: 0.6 }]}
            onPress={handleAdd}
            disabled={saving}
          >
            <Text style={styles.btnText}>{saving ? 'Guardando…' : '+ REGISTRAR'}</Text>
          </Pressable>
        </View>

        {/* ── list ── */}
        <ScrollView contentContainerStyle={styles.list}>
          {groups.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🖥️</Text>
              <Text style={styles.emptyText}>Sin registros aún{'\n'}Agrega tu primer corte</Text>
            </View>
          )}

          {groups.map((month) => (
            <View key={month.monthKey}>
              {/* month header */}
              <View style={styles.monthHeader}>
                <Text style={styles.monthText}>{month.monthKey.toUpperCase()}</Text>
              </View>

              {month.days.map((day) => {
                const dayVentas   = day.entries.reduce((s, e) => s + e.totalSales, 0);
                const dayEfectivo = day.entries.reduce((s, e) => s + e.cashAmount, 0);

                return (
                  <View key={day.dayKey} style={styles.dayBlock}>
                    {/* day header */}
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayText}>{day.dayKey.toUpperCase()}</Text>
                      <View style={styles.dayTotals}>
                        <Text style={styles.dayTotal}>Ventas {fmt(dayVentas)}</Text>
                        <Text style={[styles.dayTotal, { color: Colors.warning }]}>
                          Efectivo {fmt(dayEfectivo)}
                        </Text>
                      </View>
                    </View>

                    {/* hour entries */}
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
          ))}

          <Text style={styles.hint}>Mantén presionado un registro para eliminarlo</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.textDark },

  // header
  header:      { backgroundColor: Colors.textDark, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  headerTitle: { color: Colors.success, fontSize: 16, fontWeight: '800', fontFamily: 'monospace', letterSpacing: 1 },
  headerSub:   { color: Colors.textLight, fontSize: 12, marginTop: 2, fontFamily: 'monospace' },

  // summary
  summaryRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.textDark },
  summaryCard: { flex: 1, backgroundColor: '#1E293B', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.success + '44' },
  summaryLabel:{ color: Colors.textLight, fontSize: 10, fontFamily: 'monospace', letterSpacing: 0.5 },
  summaryValue:{ color: Colors.success, fontSize: 18, fontWeight: '800', fontFamily: 'monospace', marginTop: 4 },

  // form
  form:        { backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.success + '33' },
  inputRow:    { flexDirection: 'row', gap: 10, marginBottom: 10 },
  inputWrap:   { flex: 1 },
  inputLabel:  { color: Colors.success, fontSize: 9, fontFamily: 'monospace', letterSpacing: 0.5, marginBottom: 4 },
  input:       { backgroundColor: Colors.textDark, color: Colors.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontFamily: 'monospace', borderWidth: 1, borderColor: Colors.success + '44' },
  btn:         { backgroundColor: Colors.success, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText:     { color: Colors.white, fontWeight: '800', fontSize: 14, fontFamily: 'monospace', letterSpacing: 1 },

  // list
  list:        { backgroundColor: Colors.surface, paddingBottom: 40 },
  empty:       { alignItems: 'center', marginTop: 60 },
  emptyIcon:   { fontSize: 48, marginBottom: 12 },
  emptyText:   { color: Colors.textLight, fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // month
  monthHeader: { backgroundColor: Colors.textDark, paddingHorizontal: 16, paddingVertical: 6 },
  monthText:   { color: Colors.success, fontSize: 11, fontFamily: 'monospace', fontWeight: '700', letterSpacing: 1 },

  // day
  dayBlock:    { marginBottom: 2 },
  dayHeader:   { backgroundColor: '#E2E8F0', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayText:     { color: Colors.textDark, fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  dayTotals:   { alignItems: 'flex-end', gap: 2 },
  dayTotal:    { fontSize: 11, color: Colors.success, fontFamily: 'monospace', fontWeight: '600' },

  // entry
  entryRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.white, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border },
  entryHour:   { color: Colors.textLight, fontSize: 13, fontFamily: 'monospace', width: 50 },
  entryValues: { flexDirection: 'row', gap: 16 },
  entryVentas: { color: Colors.textDark, fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  entryCash:   { color: Colors.warning, fontSize: 13, fontFamily: 'monospace' },

  hint:        { textAlign: 'center', color: Colors.textLight, fontSize: 11, marginTop: 20, fontFamily: 'monospace' },
});
