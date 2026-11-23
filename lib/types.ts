export type Sector = 'nonbank' | 'bank';
export type Audit = 'wtp' | 'other' | 'unknown';
export type Status = 'good' | 'ok' | 'bad' | 'na' | 'info';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
/** Baris laporan keuangan yang dibaca parser. */
export type Field = 'rev' | 'ni' | 'eps' | 'ca' | 'cl' | 'liab' | 'eq' | 'cfo' | 'capex' | 'divPaid';
export type Group = 'Profitabilitas' | 'Kesehatan neraca' | 'Arus kas' | 'Dividen' | 'Audit' | 'Valuasi';

/** Nilai keuangan dalam miliar Rupiah, saham dalam juta lembar, harga dan DPS dalam Rupiah. */
export interface Inputs {
  ticker: string;
  period: string;
  sector: Sector;
  audit: Audit;
  rev?: number;
  revPrev?: number;
  ni?: number;
  niPrev?: number;
  ca?: number;
  cl?: number;
  liab?: number;
  eq?: number;
  cfo?: number;
  capex?: number;
  shares?: number;
  price?: number;
  dps?: number;
  npl?: number;
  car?: number;
}

export interface Check {
  group: Group;
  name: string;
  ref: string;
  value: string;
  status: Status;
  label: string;
}

/** Satu tahun buku dalam riwayat; satuan sama dengan Inputs (miliar Rp, DPS dalam Rupiah). */
export interface Year {
  year: number;
  rev?: number;
  ni?: number;
  eq?: number;
  liab?: number;
  cfo?: number;
  capex?: number;
  dps?: number;
}

/** Angka ringkasan untuk kartu atas; persen dalam %, harga dalam Rupiah. */
export interface Metrics {
  price?: number;
  dps?: number;
  divYield?: number;
  earningsYield?: number;
  fcfYield?: number;
  per?: number;
  pbv?: number;
  roe?: number;
}

export interface Result {
  metrics: Metrics;
  /** Riwayat yang dipakai untuk menilai (sudah digabung dengan koreksi di formulir), tahun lama lebih dulu. */
  trend: Year[];
  checks: Check[];
  alerts: string[];
  score: number | null;
  grade: Grade | null;
  price: 'Murah' | 'Wajar' | 'Mahal' | null;
  verdict: string;
}

export interface Meta {
  source: 'idx' | 'cache' | 'upload';
  file: string;
  /** Semua file yang dibaca, terbaru lebih dulu. */
  files: string[];
  year: number;
  currency: string;
  rounding: number;
  matched: Record<string, string>;
  warnings: string[];
}

export interface AnalyzeResponse {
  inputs: Inputs;
  history: Year[];
  meta: Meta;
}
