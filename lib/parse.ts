import * as XLSX from 'xlsx';
import { FIELD_NAMES } from './fields';
import type { Audit, Field } from './types';

type Rule = [include: RegExp, exclude?: RegExp];

export interface Row {
  sheet: string;
  text: string;
  nums: number[];
  /** Sel asli, untuk membaca kolom tertentu di laporan perubahan ekuitas. */
  cells: unknown[];
}

export interface Parsed {
  /** Angka mentah dalam mata uang pelaporan, belum dikali pembulatan. */
  values: Partial<Record<Field, number>>;
  prev: Partial<Record<Field, number>>;
  matched: Partial<Record<Field, string>>;
  currency: 'IDR' | 'USD';
  rounding: number;
  isBank: boolean;
  audit: Audit;
  warnings: string[];
}

/**
 * Aturan pencocokan baris. Setiap baris lembar Excel IDX berisi label Indonesia dan Inggris,
 * jadi pola mencakup keduanya. Aturan pertama yang cocok dipakai; lembar dibaca berurutan
 * (neraca, laba rugi, perubahan ekuitas, arus kas), jadi kecocokan pertama hampir selalu benar.
 * Kalau ada angka yang meleset, cek /api/debug lalu sesuaikan pola di sini.
 */
const RULES: Record<Field, Rule[]> = {
  rev: [[/penjualan dan pendapatan usaha|sales and revenue|jumlah pendapatan usaha|pendapatan neto|net revenues?|total revenues?/, /beban|cost|lain|other|ditangguhkan|deferred|muka|advance/]],
  ni: [
    [/(laba|rugi).{0,20}diatribusikan (ke|kepada) (pemilik )?entitas induk|profit.{0,12}attributable to (owners of )?(the )?parent/, /komprehensif|comprehensive|per saham|per share/],
    [/laba \(rugi\) (tahun|periode) berjalan|profit \(loss\) for the (year|period)/, /komprehensif|comprehensive|dilanjutkan|continuing|sebelum|before/],
  ],
  eps: [[/laba \(rugi\) per saham dasar|basic earnings \(loss\) per share/]],
  eq: [
    [/ekuitas.{0,30}diatribusikan (ke|kepada) (pemilik )?entitas induk|equity attributable to (equity )?owners of (the )?parent/, /komprehensif|comprehensive|liabilitas|liabilities/],
    [/jumlah ekuitas|total equity/, /liabilitas|liabilities/],
  ],
  liab: [[/jumlah liabilitas|total liabilities/, /ekuitas|equity|jangka|current|syirkah/]],
  ca: [[/jumlah aset lancar|total current assets/, /tidak lancar|non-current/]],
  cl: [[/jumlah liabilitas jangka pendek|total current liabilities/]],
  cfo: [[/(arus kas bersih|jumlah arus kas).{0,60}aktivitas operasi|net cash flows?.{0,40}operating activities/]],
  capex: [[/perolehan aset tetap|pembelian aset tetap|acquisition of property,? (plant|and equipment)|purchases? of property,? (plant|and equipment)/, /penjualan|hasil|proceeds|sale|uang muka|advance/]],
  divPaid: [[/pembayaran dividen|dividends? paid|payments? of dividends?/, /entitas anak|subsidiar|non-?pengendali|non-?controlling/]],
};
/** Baris yang tidak dipakai untuk bank (formulir menyembunyikannya), jadi tidak perlu diperingatkan. */
const NONBANK_ONLY = new Set<Field>(['ca', 'cl', 'capex']);
const BANK_REV: Rule = [/jumlah pendapatan bunga|total interest income|pendapatan bunga|interest income/, /beban|expense|bersih|net/];

export function readRows(buf: Uint8Array): Row[] {
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames.flatMap((sheet) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: true, blankrows: false }).map((cells) => ({
      sheet,
      text: cells.filter((c): c is string => typeof c === 'string').join(' | ').replace(/\s+/g, ' ').trim().toLowerCase(),
      nums: cells.filter((c): c is number => typeof c === 'number' && Number.isFinite(c)),
      cells,
    })),
  );
}

const find = (rows: Row[], [inc, exc]: Rule, needNum = true) =>
  rows.find((r) => (!needNum || r.nums.length > 0) && inc.test(r.text) && !exc?.test(r.text));

/** Lembar tahun sebelumnya: "3410000PY" (taksonomi baru) atau "4410000 2 PriorYear" (lama). */
const PRIOR = /PY$|prior ?year/i;
const PARENT_COL = /^equity attributable to (equity owners of )?(the )?parent( entity)?$/i;

/**
 * Dividen kas untuk pemilik entitas induk, dari kolom "Equity attributable to parent entity" di laporan
 * perubahan ekuitas (tahun ini dan lembar PY). Arus kas pendanaan ikut memuat dividen ke kepentingan
 * non-pengendali, misalnya TLKM 2025: 28.406 miliar di arus kas, 21.047 miliar untuk pemegang saham Telkom.
 */
function parentDividends(rows: Row[]): { cur: number; prev?: number; sheet: string } | undefined {
  const pick = (py: boolean) => {
    // Baris judul kolom laporan perubahan ekuitas: banyak sel teks, salah satunya kolom entitas induk.
    const isHead = (r: Row) => PRIOR.test(r.sheet) === py && r.cells.filter((c) => typeof c === 'string').length > 5;
    const head = rows.find((r) => isHead(r) && r.cells.some((c) => typeof c === 'string' && PARENT_COL.test(c.trim())));
    if (!head) return;
    const col = head.cells.findIndex((c) => typeof c === 'string' && PARENT_COL.test(c.trim()));
    const row = rows.find((r) => r.sheet === head.sheet && /^distribusi dividen kas|distributions of cash dividends/.test(r.text));
    const v = row?.cells[col];
    return typeof v === 'number' && Number.isFinite(v) ? { v, sheet: head.sheet } : undefined;
  };
  const cur = pick(false);
  return cur && { cur: cur.v, prev: pick(true)?.v, sheet: cur.sheet };
}

export function parseReport(buf: Uint8Array): Parsed {
  const rows = readRows(buf);
  const warnings: string[] = [];
  const isBank = rows.some((r) => /giro pada bank indonesia|current accounts with bank indonesia/.test(r.text));

  const roundRow = find(rows, [/pembulatan|level of rounding/], false);
  let rounding = !roundRow ? 1 : /miliar|billion/.test(roundRow.text) ? 1e9 : /juta|million/.test(roundRow.text) ? 1e6 : /ribu|thousand/.test(roundRow.text) ? 1e3 : 1;
  if (!roundRow) warnings.push('Tingkat pembulatan tidak ditemukan, angka dianggap dalam satuan penuh. Bandingkan dengan laporan aslinya.');

  const curRow = find(rows, [/mata uang (pelaporan|penyajian)|(reporting|presentation) currency/], false);
  const currency = curRow && /usd|dolar|dollar/.test(curRow.text) ? 'USD' : 'IDR';
  if (!curRow) warnings.push('Mata uang pelaporan tidak ditemukan, dianggap Rupiah.');

  const auditRow = find(rows, [/opini auditor|auditor['’]?s? opinion|jenis opini|type of opinion/], false);
  const audit: Audit = !auditRow ? 'unknown' : /tanpa modifikasi|unmodified|tanpa pengecualian|unqualified/.test(auditRow.text) ? 'wtp' : 'other';

  const values: Parsed['values'] = {};
  const prev: Parsed['prev'] = {};
  const matched: Parsed['matched'] = {};
  const div = parentDividends(rows);
  for (const f of Object.keys(RULES) as Field[]) {
    if (f === 'divPaid' && div) {
      [values.divPaid, prev.divPaid] = [div.cur, div.prev];
      matched.divPaid = `${div.sheet}: distribusi dividen kas, kolom ekuitas yang diatribusikan kepada entitas induk`;
      continue;
    }
    const rules = f === 'rev' && isBank ? [BANK_REV, ...RULES.rev] : RULES[f];
    const row = rules.map((r) => find(rows, r)).find(Boolean);
    if (!row) {
      if (!(isBank && NONBANK_ONLY.has(f))) warnings.push(`Baris ${FIELD_NAMES[f].toLowerCase()} tidak ditemukan. Isi manual bila perlu.`);
      continue;
    }
    [values[f], prev[f]] = row.nums;
    matched[f] = `${row.sheet}: ${row.text.slice(0, 140)}`;
  }

  // Skala angka di file IDX tidak selalu sesuai label pembulatan. Laba ÷ EPS seharusnya memberi jumlah saham
  // di bawah 1 triliun lembar; kalau lebih, salah satu dari dua kasus yang pernah ditemui:
  // - EPS ikut dibagi pembulatan (TLKM 2025: 1,7983e-7 untuk Rp179,83) → kalikan EPS dengan pembulatan;
  // - angka uang disimpan dalam rupiah penuh padahal label "jutaan" (BBCA 2023) → pembulatan dianggap 1.
  if (rounding > 1 && values.eps && values.ni && Math.abs((values.ni * rounding) / values.eps) > 1e12) {
    if (Math.abs(values.eps) < 1) {
      values.eps *= rounding;
      if (prev.eps != null) prev.eps *= rounding;
    } else rounding = 1;
  }

  return { values, prev, matched, currency, rounding, isBank, audit, warnings };
}
