/** Formatea un número con separador de miles y 2 decimales. Ej: 1234.5 → "1,234.50" */
export function fmtMXN(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
