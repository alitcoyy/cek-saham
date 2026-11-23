import type { Report } from './idx';
import { parseReport, type Parsed } from './parse';
import { lastPrice } from './price';
import type { AnalyzeResponse, Meta, Year } from './types';

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
type Vals = Parsed['values'];

/** Jumlah saham dari laba ÷ EPS dasar (rata-rata tertimbang, cukup dekat untuk valuasi). */
const sharesOf = (v: Vals, rounding: number) => (fin(v.ni) && fin(v.eps) && v.ni > 0 && v.eps > 0 ? (v.ni * rounding) / v.eps : undefined);

/** Ubah laporan mentah menjadi Inputs (miliar Rp, juta lembar), riwayat per tahun, lalu tempelkan harga terkini. */
export async function buildResponse(code: string, reports: Report[], source: Meta['source']): Promise<AnalyzeResponse> {
  const files = [...reports].sort((a, b) => b.year - a.year);
  const r = files[0];
  const parsed = files.map((f) => ({ f, p: parseReport(f.buf) }));
  const p = parsed[0].p;
  const { values: v, prev: pv, rounding } = p;
  const usd = parsed.some((x) => x.p.currency === 'USD');
  const [price, fx] = await Promise.all([lastPrice(`${code}.JK`), usd ? lastPrice('USDIDR=X') : 1]);
  const warnings = [...p.warnings];
  if (!fin(price)) warnings.push('Harga saham tidak bisa diambil. Isi manual.');
  if (!fin(fx)) warnings.push('Laporan dalam USD, tetapi kurs USD/IDR tidak bisa diambil. Angka keuangan dikosongkan.');

  const k = fin(fx) ? (rounding * fx) / 1e9 : NaN;
  const bn = (x?: number) => (fin(x) && fin(k) ? x * k : undefined);

  const sharesCount = sharesOf(v, rounding);
  if (!sharesCount) warnings.push('Jumlah saham tidak bisa dihitung dari EPS. Isi manual (lihat profil emiten di IDX).');
  let dps: number | undefined;
  if (sharesCount && fin(fx)) {
    dps = fin(v.divPaid) ? (Math.abs(v.divPaid) * rounding * fx) / sharesCount : 0;
    if (!fin(v.divPaid)) warnings.push('Pembayaran dividen tidak ditemukan di arus kas, dianggap tidak ada dividen.');
  }

  // Riwayat: tiap file memberi tahun berjalan dan tahun sebelumnya. File terbaru diproses lebih dulu,
  // jadi angka yang disajikan kembali (restated) menang atas angka di file lama.
  const history = new Map<number, Year>();
  for (const { f, p: q } of parsed) {
    const kk = fin(fx) ? (q.rounding * (q.currency === 'USD' ? fx : 1)) / 1e9 : NaN;
    const curShares = sharesOf(q.values, q.rounding) ?? sharesCount;
    for (const [year, x] of [[f.year, q.values], [f.year - 1, q.prev]] as const) {
      if (history.has(year) || !fin(x.ni ?? x.rev)) continue;
      const s = sharesOf(x, q.rounding) ?? curShares;
      const m = (y?: number) => (fin(y) && fin(kk) ? y * kk : undefined);
      history.set(year, {
        year,
        rev: m(x.rev),
        ni: m(x.ni),
        eq: m(x.eq),
        liab: m(x.liab),
        cfo: m(x.cfo),
        capex: m(fin(x.capex) ? Math.abs(x.capex) : undefined),
        dps: s && fin(kk) ? (Math.abs(x.divPaid ?? 0) * kk * 1e9) / s : undefined,
      });
    }
  }
  const years = [...history.keys()].sort();
  const missing = [r.year - 2, r.year - 4].filter((y) => !files.some((f) => f.year === y));
  if (missing.length) warnings.push(`Laporan ${missing.join(' dan ')} tidak tersedia, jadi tren memakai ${years.length} tahun (${years[0]}–${years.at(-1)}).`);

  return {
    inputs: {
      ticker: code,
      period: String(r.year),
      sector: p.isBank ? 'bank' : 'nonbank',
      audit: p.audit,
      rev: bn(v.rev),
      revPrev: bn(pv.rev),
      ni: bn(v.ni),
      niPrev: bn(pv.ni),
      ca: bn(v.ca),
      cl: bn(v.cl),
      liab: bn(v.liab),
      eq: bn(v.eq),
      cfo: bn(v.cfo),
      capex: bn(fin(v.capex) ? Math.abs(v.capex) : undefined),
      shares: sharesCount && sharesCount / 1e6,
      price,
      dps,
    },
    history: [...history.values()].sort((a, b) => a.year - b.year),
    meta: { source, file: r.file, files: files.map((f) => f.file), year: r.year, currency: p.currency, rounding, matched: p.matched, warnings },
  };
}
