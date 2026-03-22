import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView,
  Platform, Pressable, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../src/context/AuthContext';
import { ApiError, api } from '../src/services/api';
import { log } from '../src/utils/logger';
import { Colors, Gradients } from '../src/theme/colors';

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
        <Image
          source={require('../assets/logo.png')}
          style={styles.logoBox}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>Pagos con QR para tu negocio · inicia sesión</Text>
      </View>

      {/* Role toggle */}
      <View style={styles.toggle}>
        <Pressable
          style={styles.toggleTab}
          onPress={() => setIsMerchant(false)}
        >
          {!isMerchant && (
            <LinearGradient colors={Gradients.blue} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
          )}
          <Text style={[styles.toggleText, !isMerchant && styles.toggleTextActive]}>
            Cliente
          </Text>
        </Pressable>
        <Pressable
          style={styles.toggleTab}
          onPress={() => setIsMerchant(true)}
        >
          {isMerchant && (
            <LinearGradient colors={Gradients.blue} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
          )}
          <Text style={[styles.toggleText, isMerchant && styles.toggleTextActive]}>
            Comercio
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Teléfono (+5255...)"
        placeholderTextColor="rgba(255,255,255,0.35)"
        keyboardType="phone-pad"
        autoCapitalize="none"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor="rgba(255,255,255,0.35)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
      />

      <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
        <LinearGradient colors={Gradients.blue} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          {loading
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.btnText}>Entrar</Text>}
        </LinearGradient>
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
  container: { flex: 1, backgroundColor: Colors.black, padding: 24, justifyContent: 'center' },
  header:    { alignItems: 'center', marginBottom: 40 },
  logoBox:   { width: 180, height: 180, borderRadius: 36, marginBottom: 16, overflow: 'hidden' },
  title:     { fontSize: 28, fontWeight: '800', color: Colors.white, marginBottom: 4 },
  subtitle:  { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  toggle:    { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 24, padding: 4 },
  toggleTab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', overflow: 'hidden' },
  toggleText: { fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  toggleTextActive: { color: Colors.white },
  input:     { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14, color: Colors.white },
  btn:       { borderRadius: 12, overflow: 'hidden', marginTop: 8, marginBottom: 16 },
  btnGradient: { padding: 16, alignItems: 'center' },
  btnText:   { color: Colors.white, fontWeight: '700', fontSize: 16 },
  link:      { textAlign: 'center', color: Colors.primary, fontWeight: '600' },
});
