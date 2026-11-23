import type { Audit, Field, Inputs, Sector } from './types';

export const FIELD_NAMES: Record<Field, string> = {
  rev: 'Pendapatan',
  ni: 'Laba bersih',
  eps: 'Laba per saham',
  ca: 'Aset lancar',
  cl: 'Liabilitas jangka pendek',
  liab: 'Total liabilitas',
  eq: 'Ekuitas',
  cfo: 'Arus kas operasi',
  capex: 'Capex',
  divPaid: 'Dividen dibayar',
};

const NUM = ['rev', 'revPrev', 'ni', 'niPrev', 'ca', 'cl', 'liab', 'eq', 'cfo', 'capex', 'shares', 'price', 'dps', 'npl', 'car'] as const;
type NumKey = (typeof NUM)[number];
export type FormState = Record<NumKey | 'ticker' | 'period' | 'sector' | 'audit', string>;

export interface FieldDef {
  key: keyof FormState;
  label: string;
  unit?: string;
  only?: Sector;
  text?: boolean;
  options?: [value: string, label: string][];
}

export const FORM_GROUPS: [string, FieldDef[]][] = [
  ['Identitas', [
    { key: 'ticker', label: 'Kode saham', text: true },
    { key: 'period', label: 'Tahun buku', text: true },
    { key: 'sector', label: 'Sektor', options: [['nonbank', 'Non-bank'], ['bank', 'Bank']] },
  ]],
  ['Laba rugi', [
    { key: 'rev', label: 'Pendapatan tahun ini', unit: 'miliar' },
    { key: 'revPrev', label: 'Pendapatan tahun lalu', unit: 'miliar' },
    { key: 'ni', label: 'Laba bersih tahun ini', unit: 'miliar' },
    { key: 'niPrev', label: 'Laba bersih tahun lalu', unit: 'miliar' },
  ]],
  ['Neraca', [
    { key: 'ca', label: 'Aset lancar', unit: 'miliar', only: 'nonbank' },
    { key: 'cl', label: 'Liabilitas jangka pendek', unit: 'miliar', only: 'nonbank' },
    { key: 'liab', label: 'Total liabilitas', unit: 'miliar' },
    { key: 'eq', label: 'Ekuitas pemilik entitas induk', unit: 'miliar' },
  ]],
  ['Rasio khusus bank', [
    { key: 'npl', label: 'NPL gross', unit: '%', only: 'bank' },
    { key: 'car', label: 'CAR', unit: '%', only: 'bank' },
  ]],
  ['Arus kas', [
    { key: 'cfo', label: 'Arus kas operasi', unit: 'miliar', only: 'nonbank' },
    { key: 'capex', label: 'Belanja modal (capex)', unit: 'miliar', only: 'nonbank' },
  ]],
  ['Pasar dan dividen', [
    { key: 'shares', label: 'Saham beredar', unit: 'juta lbr' },
    { key: 'price', label: 'Harga saham', unit: 'Rp' },
    { key: 'dps', label: 'Dividen per saham', unit: 'Rp' },
  ]],
  ['Audit', [
    { key: 'audit', label: 'Opini auditor', options: [['wtp', 'Wajar tanpa modifikasian (WTP)'], ['other', 'Selain WTP'], ['unknown', 'Belum dicek']] },
  ]],
];

export const toForm = (i: Partial<Inputs>): FormState => ({
  ticker: i.ticker ?? '',
  period: i.period ?? '',
  sector: i.sector ?? 'nonbank',
  audit: i.audit ?? 'unknown',
  ...(Object.fromEntries(NUM.map((k) => [k, i[k] == null ? '' : String(+i[k].toFixed(2))])) as Record<NumKey, string>),
});

export const fromForm = (f: FormState): Inputs => ({
  ticker: f.ticker.trim().toUpperCase(),
  period: f.period.trim(),
  sector: f.sector as Sector,
  audit: f.audit as Audit,
  ...Object.fromEntries(NUM.map((k) => [k, f[k].trim() === '' ? undefined : Number(f[k])])),
});
