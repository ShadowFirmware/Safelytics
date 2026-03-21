import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../src/theme/colors';
import { log } from '../src/utils/logger';

const QR_SCHEME = 'safelytics://pay/';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const scanned = useRef(false);

  // Permission not yet determined
  if (!permission) return <View style={styles.center} />;

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Necesitamos acceso a la cámara para escanear QR</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Permitir cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.textLight }}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned.current) return;

    let paymentId: string | null = null;
    if (data.startsWith(QR_SCHEME)) {
      paymentId = data.slice(QR_SCHEME.length).split('?')[0];
    }

    if (!paymentId) return; // no es QR PagaLoop (esquema safelytics:// legacy)

    scanned.current = true;
    log.action('EscanearQR', 'QR PagaLoop leído', { paymentId, rawLength: data.length });
    router.replace(`/confirm/${paymentId}`);
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onBarcodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Escanear QR</Text>
          <TouchableOpacity onPress={() => setTorch((t) => !t)} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>{torch ? '🔦' : '💡'}</Text>
          </TouchableOpacity>
        </View>

        {/* Cutout */}
        <View style={styles.cutoutRow}>
          <View style={styles.shade} />
          <View style={styles.cutout}>
            {/* Corners */}
            {['TL','TR','BL','BR'].map((c) => (
              <View key={c} style={[styles.corner, styles[c as keyof typeof styles] as object]} />
            ))}
          </View>
          <View style={styles.shade} />
        </View>

        {/* Bottom hint */}
        <View style={[styles.shade, { flex: 1, justifyContent: 'flex-start', paddingTop: 24 }]}>
          <Text style={styles.hint}>Apunta al QR del comercio</Text>
        </View>
      </View>
    </View>
  );
}

const CUTOUT = 260;
const RADIUS = 16;
const CORNER = 28;
const BORDER = 3;

const styles = StyleSheet.create({
  center:   { flex: 1, backgroundColor: Colors.black, justifyContent: 'center', alignItems: 'center', padding: 32 },
  permText: { color: Colors.white, textAlign: 'center', fontSize: 16, marginBottom: 24 },
  permBtn:  { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  permBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },

  overlay:  { flex: 1 },
  topBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
  topTitle: { color: Colors.white, fontSize: 17, fontWeight: '600' },
  iconBtn:  { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  iconBtnText: { fontSize: 20, color: Colors.white },

  cutoutRow: { flexDirection: 'row', height: CUTOUT },
  shade:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  cutout:    { width: CUTOUT, height: CUTOUT, borderRadius: RADIUS, overflow: 'hidden' },

  corner:  { position: 'absolute', width: CORNER, height: CORNER, borderColor: Colors.white, borderWidth: BORDER },
  TL:      { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: RADIUS },
  TR:      { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: RADIUS },
  BL:      { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: RADIUS },
  BR:      { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: RADIUS },

  hint: { color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: 14 },
});
