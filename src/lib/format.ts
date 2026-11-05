const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

export function silver(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)} m`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)} k`;
  return nf.format(n);
}

export const pct = (n: number | null | undefined, digits = 1) => (n == null || !isFinite(n) ? '—' : `${(n * 100).toFixed(digits)} %`);

export const roman = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n] ?? String(n);

export const ageLabel = (h: number | null) => (h == null ? '' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);
