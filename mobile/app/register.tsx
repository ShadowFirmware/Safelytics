import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity,
} from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { ApiError, api } from '../src/services/api';
import { log } from '../src/utils/logger';
import { Colors } from '../src/theme/colors';

export default function RegisterScreen() {
  const { role } = useLocalSearchParams<{ role: 'user' | 'merchant' }>();
  const { login } = useAuth();
  const isMerchant = role === 'merchant';

  const [nameOrBiz, setNameOrBiz] = useState('');
  const [phone,     setPhone]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);

  const handleRegister = async () => {
    if (password !== confirm) {
      log.action('Register', 'Validación fallida: contraseñas no coinciden');
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    log.action('Register', `Registro (${isMerchant ? 'comercio' : 'cliente'})`, {
      phone: phone.trim(),
      nameOrBiz: nameOrBiz.trim(),
    });
    try {
      const data = isMerchant
        ? await api.registerMerchant({ business_name: nameOrBiz.trim(), phone: phone.trim(), password })
        : await api.registerUser({ name: nameOrBiz.trim(), phone: phone.trim(), password });

      await login(data.token, isMerchant ? 'merchant' : 'user', data.id);
      log.action('Register', 'Cuenta creada, navegando…');
      router.replace(isMerchant ? '/merchant' : '/customer');
    } catch (e) {
      log.error('Register', e);
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Intenta de nuevo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isMerchant ? 'Registrar comercio' : 'Crear cuenta'}</Text>

        <TextInput
          style={styles.input}
          placeholder={isMerchant ? 'Nombre del negocio' : 'Tu nombre'}
          placeholderTextColor={Colors.textLight}
          autoCapitalize="words"
          value={nameOrBiz}
          onChangeText={setNameOrBiz}
        />
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
        />
        <TextInput
          style={styles.input}
          placeholder="Confirmar contraseña"
          placeholderTextColor={Colors.textLight}
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          onSubmitEditing={handleRegister}
        />

        <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
          {loading
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.btnText}>Crear cuenta</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Ya tengo cuenta</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.surface, padding: 24, justifyContent: 'center' },
  title:     { fontSize: 26, fontWeight: '800', color: Colors.textDark, marginBottom: 32, textAlign: 'center' },
  input:     { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14, color: Colors.textDark },
  btn:       { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  btnText:   { color: Colors.white, fontWeight: '700', fontSize: 16 },
  link:      { textAlign: 'center', color: Colors.primary, fontWeight: '600' },
});
