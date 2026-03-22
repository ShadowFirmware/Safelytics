/**
 * URL del backend PagaLoop (Rust).
 *
 * - Teléfono físico + Expo Go: crea `mobile/.env` con la IPv4 de tu PC en la red
 *   compartida (WiFi o hotspot): EXPO_PUBLIC_API_URL=http://192.168.x.x:8080
 * - Emulador Android: sin .env se usa 10.0.2.2 (alias del host; NO sirve en físico).
 */
import * as Device from 'expo-device';
import {
  log,
  sanitizeBodyString,
  summarizeApiResponse,
} from '../utils/logger';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://10.0.2.2:8080';

const BAD_PHYSICAL_URL =
  /10\.0\.2\.2|127\.0\.0\.1|localhost/i.test(BASE_URL);

if (__DEV__ && Device.isDevice && BAD_PHYSICAL_URL) {
  console.warn(
    '\n[PagaLoop] ⚠️ Teléfono físico detectado pero la API usa una URL de emulador/localhost.\n' +
      '   Crea mobile/.env con la IP de tu PC (misma red que el teléfono), ejemplo:\n' +
      '   EXPO_PUBLIC_API_URL=http://192.168.43.12:8080\n' +
      '   (también puede ser 10.x.x.x u otra red local; debe coincidir con ipconfig en Windows).\n' +
      '   En Windows: ipconfig → IPv4 del adaptador Wi‑Fi (si el PC usa hotspot del móvil, es la IP que te da ese hotspot).\n' +
      '   Reinicia Metro (expo start -c) después de guardar .env.\n',
  );
}

log.info('Cliente API inicializado', { baseUrl: BASE_URL });

export class ApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const url = `${BASE_URL}${path}`;

  log.apiRequest(method, url, {
    path,
    baseUrl: BASE_URL,
    withAuth: Boolean(token),
    body: typeof options.body === 'string' ? sanitizeBodyString(options.body) : null,
  });

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      log.apiError(path, 'Respuesta no es JSON válido', {
        status: res.status,
        preview: text.slice(0, 300),
      });
      throw new ApiError('Respuesta no válida del servidor', res.status);
    }

    if (!res.ok) {
      const msg =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error?: string }).error ?? 'Error desconocido')
          : 'Error desconocido';
      log.apiError(path, msg, {
        status: res.status,
        body: summarizeApiResponse(data),
      });
      throw new ApiError(msg, res.status);
    }

    log.apiOk(path, res.status, summarizeApiResponse(data));
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    log.apiError(path, message, { tipo: 'red o fetch' });
    throw new ApiError(
      message.includes('Network request failed')
        ? 'Sin conexión al servidor. Revisa WiFi, IP en .env y que el backend esté en marcha.'
        : message,
    );
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  id: string;
  public_key: string;
}

export const api = {
  registerUser: (body: { phone: string; name: string; password: string }, token?: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  loginUser: (body: { phone: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  registerMerchant: (body: { business_name: string; phone: string; password: string }) =>
    request<AuthResponse>('/api/auth/merchant/register', { method: 'POST', body: JSON.stringify(body) }),

  loginMerchant: (body: { phone: string; password: string }) =>
    request<AuthResponse>('/api/auth/merchant/login', { method: 'POST', body: JSON.stringify(body) }),

  // ── QR / Payments ───────────────────────────────────────────────────────────

  getPaymentInfo: (paymentId: string) =>
    request<{
      payment_id: string;
      merchant_name: string;
      amount_mxn: number;
      description?: string;
      expires_at: string;
      status: string;
    }>(`/api/qr/${paymentId}`),

  /** Cotización: comisión PagaLoop + equivalente USDC referencial (oracle estático en servidor). */
  getPaymentQuote: (paymentId: string) =>
    request<{
      payment_id: string;
      amount_mxn: number;
      customer_pays_mxn: number;
      platform_fee_bps: number;
      platform_fee_mxn: number;
      merchant_receives_mxn: number;
      stablecoin_reference_usdc: number;
      reference_mxn_per_usdc: number;
      disclaimer_es: string;
    }>(`/api/qr/${paymentId}/quote`),

  sendPayment: (paymentId: string, token: string) =>
    request<{
      payment_id: string;
      stellar_tx_hash: string;
      amount_mxn: number;
      status: string;
    }>('/api/payments/send', { method: 'POST', body: JSON.stringify({ payment_id: paymentId, confirm: true }) }, token),

  getHistory: (token: string) =>
    request<Array<{
      id: string;
      amount_mxn: number;
      status: string;
      stellar_tx_hash?: string;
      created_at: string;
    }>>('/api/payments/history', {}, token),

  // ── Merchant ────────────────────────────────────────────────────────────────

  getMerchantBalance: (token: string) =>
    request<{ public_key: string; mxne_balance: number }>('/api/merchant/balance', {}, token),

  generateQr: (body: { amount_mxn: number; description?: string }, token: string) =>
    request<{ payment_id: string; amount_mxn: number; expires_at: string }>(
      '/api/qr/generate',
      { method: 'POST', body: JSON.stringify({ ...body, expires_in_minutes: 10 }) },
      token,
    ),

  // ── Cartera (testnet + retiros) ─────────────────────────────────────────────

  /** Saldo MXNe (cliente o comercio). */
  getWalletBalance: (token: string) =>
    request<{ public_key: string; mxne_balance: number }>('/api/wallet/balance', {}, token),

  /** Testnet: Friendbot + trustline MXNe (ejecutar una vez por wallet). */
  bootstrapTestnet: (token: string) =>
    request<{
      public_key: string;
      friendbot_attempted: boolean;
      friendbot_error: string | null;
      change_trust_tx_hash: string;
      message: string;
    }>('/api/wallet/bootstrap-testnet', { method: 'POST', body: '{}' }, token),

  /** Testnet: emisor envía MXNe (requiere MXNE_ISSUER_SECRET en servidor). */
  faucetMxne: (amount_mxn: number, token: string) =>
    request<{ stellar_tx_hash: string; amount_mxn: number }>(
      '/api/wallet/faucet-mxne',
      { method: 'POST', body: JSON.stringify({ amount_mxn }) },
      token,
    ),

  /** Retiro on-chain MXNe a otra dirección G... */
  withdrawStellar: (body: { destination: string; amount_mxn: number }, token: string) =>
    request<{ stellar_tx_hash: string; amount_mxn: number; destination: string }>(
      '/api/merchant/withdraw-stellar',
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),

  /** Solicitud de retiro a banco (registro en BD; en prod iría a anchor/SPEI). */
  withdrawBank: (body: { amount_mxn: number; bank_account: string }, token: string) =>
    request<{ status: string; message: string; withdrawal_id: string }>(
      '/api/merchant/withdraw',
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),
};
