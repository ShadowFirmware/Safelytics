/**
 * Logs con prefijo [Safelytics] para ver en la terminal de Metro (Expo)
 * y en React Native Debugger.
 */
const TAG = '[PagaLoop]';

function ts() {
  return new Date().toISOString().slice(11, 23);
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'authorization',
  'stellar_secret_encrypted',
  'secret',
]);

/** Quita datos sensibles antes de imprimir JSON */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return '…';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeForLog(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (SENSITIVE_KEYS.has(key)) out[k] = '***';
    else out[k] = sanitizeForLog(v, depth + 1);
  }
  return out;
}

export function sanitizeBodyString(body: string | undefined | null): unknown {
  if (body == null || body === '') return null;
  try {
    return sanitizeForLog(JSON.parse(body));
  } catch {
    return '(cuerpo no JSON)';
  }
}

/** Respuestas API: oculta token largo y payloads enormes */
export function summarizeApiResponse(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = { ...(data as Record<string, unknown>) };
  if (typeof d.token === 'string') d.token = '***';
  if (typeof d.qr_png_b64 === 'string') d.qr_png_b64 = `[base64 ${d.qr_png_b64.length} chars]`;
  return sanitizeForLog(d);
}

export const log = {
  /** Acción de usuario / pantalla */
  action(screen: string, message: string, extra?: Record<string, unknown>) {
    if (extra !== undefined) {
      console.log(`${TAG} ${ts()} [${screen}] ${message}`, extra);
    } else {
      console.log(`${TAG} ${ts()} [${screen}] ${message}`);
    }
  },

  /** Petición HTTP (antes de fetch) */
  apiRequest(method: string, url: string, details?: Record<string, unknown>) {
    console.log(`${TAG} ${ts()} [API →] ${method} ${url}`, details ?? '');
  },

  /** Respuesta HTTP correcta */
  apiOk(path: string, status: number, bodySummary: unknown) {
    console.log(`${TAG} ${ts()} [API ✓] ${status} ${path}`, bodySummary);
  },

  /** Error HTTP (4xx/5xx) o fallo de red */
  apiError(path: string, message: string, extra?: Record<string, unknown>) {
    console.warn(`${TAG} ${ts()} [API ✗] ${path} — ${message}`, extra ?? '');
  },

  /** Errores genéricos en pantallas */
  error(screen: string, err: unknown) {
    if (err instanceof Error) {
      console.warn(`${TAG} ${ts()} [${screen}] Error: ${err.message}`, err.stack);
    } else {
      console.warn(`${TAG} ${ts()} [${screen}] Error:`, err);
    }
  },

  info(message: string, extra?: unknown) {
    if (extra !== undefined) console.log(`${TAG} ${ts()} ${message}`, extra);
    else console.log(`${TAG} ${ts()} ${message}`);
  },
};
