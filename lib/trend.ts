import { pct, rp } from './score';
import type { Year } from './types';

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Miliar Rupiah → "Rp57,5 T" atau "Rp850 M". */
export const money = (x: number) =>
  Math.abs(x) >= 1000 ? `Rp${(x / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} T` : `Rp${Math.round(x).toLocaleString('id-ID')} M`;

export interface TrendMetric {
  label: string;
  get: (y: Year) => number | undefined;
  fmt: (x: number) => string;
  /** Tampilkan CAGR awal→akhir (hanya untuk besaran yang selalu positif). */
  growth?: boolean;
}

/** Metrik yang digambar di bagian tren (situs dan PDF). */
export const trendMetrics = (bank: boolean): TrendMetric[] => [
  { label: bank ? 'Pendapatan bunga' : 'Pendapatan', get: (y) => y.rev, fmt: money, growth: true },
  { label: 'Laba bersih', get: (y) => y.ni, fmt: money, growth: true },
  { label: 'ROE', get: (y) => (fin(y.ni) && fin(y.eq) && y.eq > 0 ? (y.ni / y.eq) * 100 : undefined), fmt: pct },
  ...(bank ? [] : [{ label: 'Free cash flow', get: (y: Year) => (fin(y.cfo) && fin(y.capex) ? y.cfo - y.capex : undefined), fmt: money }]),
  { label: 'Dividen per saham', get: (y) => y.dps, fmt: rp, growth: true },
];

/** CAGR dari titik positif pertama ke terakhir; null kalau kurang dari 3 titik. */
export function growth(pts: [year: number, value: number][]): number | null {
  const ok = pts.filter(([, v]) => v > 0);
  if (ok.length < 3) return null;
  const [[y0, a], [y1, b]] = [ok[0], ok.at(-1)!];
  return ((b / a) ** (1 / (y1 - y0)) - 1) * 100;
}

/** Geometri batang: tinggi (%) dan posisi garis nol (% dari atas), skala mulai dari nol. */
export function bars(vals: (number | undefined)[]) {
  const nums = vals.filter(fin);
  const max = Math.max(0, ...nums);
  const min = Math.min(0, ...nums);
  const zero = max === min ? 100 : (max / (max - min)) * 100;
  const height = (v: number) => (max === min ? 0 : (Math.abs(v) / (max - min)) * 100);
  return { zero, height };
}
