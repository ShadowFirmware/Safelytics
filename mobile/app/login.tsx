import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Pressable, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { ApiError, api } from '../src/services/api';
import { log } from '../src/utils/logger';
import { Colors } from '../src/theme/colors';

export default function LoginScreen() {
  const { login } = useAuth();
  const [isMerchant, setIsMerchant] = useState(false);
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) return;
    setLoading(true);
    log.action('Login', `Iniciando sesión (${isMerchant ? 'comercio' : 'cliente'})`, {
      phone: phone.trim(),
    });
    try {
      const data = isMerchant
        ? await api.loginMerchant({ phone: phone.trim(), password })
        : await api.loginUser({ phone: phone.trim(), password });

      await login(data.token, isMerchant ? 'merchant' : 'user', data.id);
      log.action('Login', 'Sesión OK, navegando…');
      router.replace(isMerchant ? '/merchant' : '/customer');
    } catch (e) {
      log.error('Login', e);
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Intenta de nuevo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View style={styles.logoBox}>
          <Text style={styles.logoIcon}>⚡</Text>
        </View>
        <Text style={styles.title}>PagaLoop</Text>
        <Text style={styles.subtitle}>Pagos con QR para tu negocio · inicia sesión</Text>
      </View>

      {/* Role toggle */}
      <View style={styles.toggle}>
        <Pressable
          style={[styles.toggleTab, !isMerchant && styles.toggleTabActive]}
          onPress={() => setIsMerchant(false)}
        >
          <Text style={[styles.toggleText, !isMerchant && styles.toggleTextActive]}>
            Cliente
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleTab, isMerchant && styles.toggleTabActive]}
          onPress={() => setIsMerchant(true)}
        >
          <Text style={[styles.toggleText, isMerchant && styles.toggleTextActive]}>
            Comercio
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Teléfono (+5255...)"
        placeholderTextColor={Colors.textLight}
        keyboardType="phone-pad"
        autoCapitalize="none"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor={Colors.textLight}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
      />

      <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
        {loading
          ? <ActivityIndicator color={Colors.white} />
          : <Text style={styles.btnText}>Entrar</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push(isMerchant ? '/register?role=merchant' : '/register?role=user')}
      >
        <Text style={styles.link}>¿No tienes cuenta? Regístrate</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface, padding: 24, justifyContent: 'center' },
  header:    { alignItems: 'center', marginBottom: 40 },
  logoBox:   { width: 72, height: 72, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoIcon:  { fontSize: 36 },
  title:     { fontSize: 28, fontWeight: '800', color: Colors.textDark, marginBottom: 4 },
  subtitle:  { fontSize: 15, color: Colors.textLight },
  toggle:    { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 24, padding: 4 },
  toggleTab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  toggleTabActive: { backgroundColor: Colors.primary },
  toggleText: { fontWeight: '600', color: Colors.textLight },
  toggleTextActive: { color: Colors.white },
  input:     { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14, color: Colors.textDark },
  btn:       { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  btnText:   { color: Colors.white, fontWeight: '700', fontSize: 16 },
  link:      { textAlign: 'center', color: Colors.primary, fontWeight: '600' },
});
