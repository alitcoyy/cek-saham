import type { Check, Grade, Group, Inputs, Metrics, Result, Status, Year } from './types';

export const GROUPS: Group[] = ['Profitabilitas', 'Kesehatan neraca', 'Arus kas', 'Dividen', 'Audit', 'Valuasi'];
export const GRADES: Record<Grade, [label: string, status: Status]> = {
  A: ['Sangat sehat', 'good'],
  B: ['Sehat', 'good'],
  C: ['Cukup', 'ok'],
  D: ['Lemah', 'bad'],
  E: ['Bermasalah', 'bad'],
};

const [P, N, K, D, A, V] = GROUPS;
const PTS: Partial<Record<Status, number>> = { good: 2, ok: 1, bad: 0 };
const LABEL: Record<Status, string> = { good: 'Baik', ok: 'Cukup', bad: 'Perhatian', na: 'Belum ada', info: 'Info' };
const PRICE = { good: 'Murah', ok: 'Wajar', bad: 'Mahal' } as const;

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nf = (x: number, d = 1) => x.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (x: number) => `${nf(x)}%`;
export const mult = (x: number) => `${nf(x, 2)}x`;
export const rp = (x: number) => `Rp${Math.round(x).toLocaleString('id-ID')}`;
const bn = (x: number) => `Rp${Math.round(x).toLocaleString('id-ID')} miliar`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const cagr = (a: number, b: number, years: number) => ((b / a) ** (1 / years) - 1) * 100;
const range = (ys: Year[]) => `${ys[0].year}–${ys.at(-1)!.year}`;
/** Minimal 3 titik data untuk dinilai sebagai tren; kurang dari itu kembali ke perbandingan 1 tahun. */
const MIN_YEARS = 3;

/** Gabungkan riwayat dengan formulir: dua tahun terakhir mengikuti isian supaya koreksi manual ikut dihitung. */
export function series(d: Inputs, history: Year[] = []): Year[] {
  const map = new Map(history.map((y) => [y.year, { ...y }]));
  const last = Number(d.period);
  if (Number.isInteger(last) && last > 1900) {
    map.set(last, { ...map.get(last), year: last, rev: d.rev, ni: d.ni, eq: d.eq, liab: d.liab, cfo: d.cfo, capex: d.capex, dps: d.dps });
    map.set(last - 1, { ...map.get(last - 1), year: last - 1, rev: d.revPrev, ni: d.niPrev });
    for (const y of map.keys()) if (y > last) map.delete(y);
  }
  return [...map.values()].sort((a, b) => a.year - b.year);
}

const hi = (x: number, a: number, b: number): Status => (x >= a ? 'good' : x >= b ? 'ok' : 'bad');
const lo = (x: number, a: number, b: number): Status => (x <= a ? 'good' : x <= b ? 'ok' : 'bad');

export function score(d: Inputs, history: Year[] = []): Result {
  const bank = d.sector === 'bank';
  const { rev, revPrev, ni, niPrev, ca, cl, liab, eq, cfo, capex, shares, price, dps, npl, car } = d;
  const checks: Check[] = [];
  const flags: string[] = [];
  const crit: string[] = [];
  const add = (group: Group, name: string, ref: string, value: string, status: Status, label = LABEL[status]) =>
    checks.push({ group, name, ref, value, status, label });
  const miss = (group: Group, name: string) => add(group, name, 'Data belum lengkap', '—', 'na');
  let revG: number | undefined, niG: number | undefined, roe: number | undefined, fcf: number | undefined;
  const T = series(d, history);
  const has = (...k: (keyof Year)[]) => T.filter((y) => k.every((key) => fin(y[key])));

  // Profitabilitas
  if (fin(ni) && ni <= 0) crit.push('Perusahaan mencatat rugi bersih.');

  if (fin(rev) && fin(revPrev) && revPrev > 0) revG = (rev / revPrev - 1) * 100;
  const rv = has('rev').filter((y) => y.rev! > 0);
  if (rv.length >= MIN_YEARS) {
    const g = cagr(rv[0].rev!, rv.at(-1)!.rev!, rv.at(-1)!.year - rv[0].year);
    add(P, 'Pertumbuhan pendapatan', `CAGR ${range(rv)}. ≥10% baik, 0–10% cukup`, `${pct(g)}/th`, hi(g, 10, 0));
  } else if (fin(revG)) add(P, 'Pertumbuhan pendapatan', '1 tahun. ≥10% baik, 0–10% cukup', pct(revG), hi(revG, 10, 0));
  else miss(P, 'Pertumbuhan pendapatan');

  const nv = has('ni');
  if (fin(ni) && fin(niPrev) && ni > 0 && niPrev > 0) niG = (ni / niPrev - 1) * 100;
  if (nv.length >= MIN_YEARS) {
    const [a, b] = [nv[0], nv.at(-1)!];
    if (b.ni! <= 0) add(P, 'Pertumbuhan laba bersih', 'Laba tahun terakhir harus positif', 'Rugi', 'bad');
    else if (a.ni! <= 0) add(P, 'Pertumbuhan laba bersih', `Masih rugi di ${a.year}`, 'Berbalik untung', 'ok');
    else {
      const g = cagr(a.ni!, b.ni!, b.year - a.year);
      add(P, 'Pertumbuhan laba bersih', `CAGR ${range(nv)}. ≥10% baik, 0–10% cukup`, `${pct(g)}/th`, hi(g, 10, 0));
    }
    const pos = nv.filter((y) => y.ni! > 0).length;
    add(P, 'Konsistensi laba', `Tahun untung, ${range(nv)}`, `${pos}/${nv.length} tahun`, pos === nv.length ? 'good' : pos >= nv.length - 1 ? 'ok' : 'bad');
    const last4 = nv.slice(-4).map((y) => y.ni!);
    if (last4.length === 4 && last4.every((x, i) => !i || x < last4[i - 1])) flags.push('Laba bersih turun tiga tahun berturut-turut.');
  } else if (!fin(ni) || !fin(niPrev)) miss(P, 'Pertumbuhan laba bersih');
  else if (ni <= 0) add(P, 'Pertumbuhan laba bersih', 'Laba harus positif', 'Rugi', 'bad');
  else if (niPrev <= 0) add(P, 'Pertumbuhan laba bersih', 'Tahun lalu rugi', 'Berbalik untung', 'good');
  else if (fin(niG)) add(P, 'Pertumbuhan laba bersih', '1 tahun. ≥10% baik, 0–10% cukup', pct(niG), hi(niG, 10, 0));

  if (fin(ni) && fin(rev) && rev > 0) {
    const m = (ni / rev) * 100;
    add(P, 'Net profit margin', bank ? 'Bank: ≥20% baik, 10–20% cukup' : '≥10% baik, 3–10% cukup', pct(m), bank ? hi(m, 20, 10) : hi(m, 10, 3));
  } else miss(P, 'Net profit margin');

  if (!fin(ni) || !fin(eq)) miss(P, 'ROE (imbal hasil ekuitas)');
  else if (eq <= 0) {
    add(P, 'ROE (imbal hasil ekuitas)', 'Ekuitas harus positif', 'Ekuitas negatif', 'bad');
    crit.push('Ekuitas negatif: total utang lebih besar dari seluruh aset.');
  } else {
    roe = (ni / eq) * 100;
    const rq = has('ni', 'eq').filter((y) => y.eq! > 0);
    if (rq.length >= MIN_YEARS) {
      const avg = sum(rq.map((y) => (y.ni! / y.eq!) * 100)) / rq.length;
      add(P, 'ROE rata-rata', `${range(rq)}, tahun terakhir ${pct(roe)}. ≥15% baik, 8–15% cukup`, pct(avg), hi(avg, 15, 8));
    } else add(P, 'ROE (imbal hasil ekuitas)', '≥15% baik, 8–15% cukup', pct(roe), hi(roe, 15, 8));
  }

  if (fin(revG) && fin(niG) && revG < 0 && niG > 30)
    flags.push('Pendapatan turun tetapi laba melonjak. Cek apakah ada keuntungan sekali, misalnya dari penjualan aset atau selisih kurs.');

  // Kesehatan neraca
  if (!bank) {
    if (fin(liab) && fin(eq) && eq > 0) {
      const der = liab / eq;
      add(N, 'DER (utang ÷ ekuitas)', '≤1x baik, 1–2x cukup', mult(der), lo(der, 1, 2));
      if (der > 2) flags.push('Utang lebih dari dua kali modal sendiri. Cek kemampuan membayar bunganya.');
    } else miss(N, 'DER (utang ÷ ekuitas)');
    if (fin(ca) && fin(cl) && cl > 0) add(N, 'Current ratio', '≥1,5x baik, 1–1,5x cukup', mult(ca / cl), hi(ca / cl, 1.5, 1));
    else miss(N, 'Current ratio');
  } else {
    if (fin(npl)) add(N, 'NPL (kredit bermasalah)', '≤3% baik, 3–5% cukup', pct(npl), lo(npl, 3, 5));
    else miss(N, 'NPL (kredit bermasalah)');
    if (fin(car)) add(N, 'CAR (kecukupan modal)', '≥15% baik, 12–15% cukup', pct(car), hi(car, 15, 12));
    else miss(N, 'CAR (kecukupan modal)');
  }

  // Arus kas
  if (!bank) {
    if (!fin(cfo) || !fin(ni)) miss(K, 'Arus kas operasi ÷ laba');
    else if (cfo < 0) {
      add(K, 'Arus kas operasi ÷ laba', 'Kas operasi harus positif', 'Negatif', 'bad');
      crit.push('Arus kas operasi negatif: bisnis inti belum menghasilkan uang tunai.');
      if (ni > 0) flags.push('Perusahaan mencatat laba, tetapi arus kas operasinya negatif. Cek pertumbuhan piutang dan persediaan.');
    } else if (ni <= 0) add(K, 'Arus kas operasi ÷ laba', 'Laba negatif, kas operasi positif', 'Kas positif', 'ok');
    else {
      // Kumulatif beberapa tahun meredam efek waktu penagihan piutang di satu tahun.
      const cv = has('cfo', 'ni');
      const [sc, sn] = [sum(cv.map((y) => y.cfo!)), sum(cv.map((y) => y.ni!))];
      if (cv.length >= MIN_YEARS && sn > 0) add(K, 'Arus kas operasi ÷ laba', `Kumulatif ${range(cv)}. ≥1x baik, 0,7–1x cukup`, mult(sc / sn), hi(sc / sn, 1, 0.7));
      else add(K, 'Arus kas operasi ÷ laba', '≥1x baik, 0,7–1x cukup', mult(cfo / ni), hi(cfo / ni, 1, 0.7));
    }

    if (fin(cfo) && fin(capex)) fcf = cfo - Math.abs(capex);
    const fv = has('cfo', 'capex').map((y) => y.cfo! - y.capex!);
    if (fv.length >= MIN_YEARS) {
      const [total, pos] = [sum(fv), fv.filter((x) => x > 0).length];
      add(K, 'Free cash flow kumulatif', `${range(has('cfo', 'capex'))}, positif ${pos} dari ${fv.length} tahun`, bn(total), total > 0 && pos >= fv.length - 1 ? 'good' : total > 0 ? 'ok' : 'bad');
    } else if (fin(fcf)) add(K, 'Free cash flow', 'Arus kas operasi − capex, harus positif', bn(fcf), fcf > 0 ? 'good' : 'bad');
    else miss(K, 'Free cash flow');
  } else {
    add(K, 'Arus kas', 'Arus kas bank naik-turun mengikuti dana nasabah dan kredit, jadi tidak dinilai', '—', 'na', 'Tidak dinilai');
  }

  // Dividen
  const eps = fin(ni) && fin(shares) && shares > 0 ? (ni * 1000) / shares : undefined;
  if (fin(dps) && dps > 0) {
    if (!fin(eps)) miss(D, 'Payout ratio');
    else if (eps <= 0) {
      add(D, 'Payout ratio', 'Dividen seharusnya dari laba', 'Dibagi saat rugi', 'bad');
      flags.push('Dividen dibagikan padahal perusahaan rugi.');
    } else {
      const p = (dps / eps) * 100;
      add(D, 'Payout ratio', '30–70% baik, di atas 100% berisiko', pct(p), p > 100 ? 'bad' : p >= 30 && p <= 70 ? 'good' : 'ok');
      if (p > 100) flags.push('Dividen melebihi laba tahun ini. Pembagian sebesar ini sulit dipertahankan.');
    }
    if (!bank) {
      if (fin(fcf) && fin(shares)) {
        const total = (dps * shares) / 1000;
        const covered = fcf > 0 && fcf >= total;
        add(D, 'FCF ÷ total dividen', '≥1x berarti dividen dibayar dari kas bisnis', fcf > 0 ? mult(fcf / total) : 'FCF negatif', covered ? 'good' : 'bad');
        if (!covered) flags.push('Total dividen lebih besar dari free cash flow, kemungkinan dibiayai utang atau kas lama.');
      } else miss(D, 'FCF ÷ total dividen');
    }
  } else if (dps === 0) add(D, 'Dividen', 'Tidak ada dividen yang dibayar tahun ini', 'Tidak ada', 'info');
  else miss(D, 'Dividen per saham');

  const dv = has('dps');
  const paid = dv.filter((y) => y.dps! > 0);
  if (dv.length >= MIN_YEARS && paid.length) {
    const [a, b] = [paid[0], paid.at(-1)!];
    const g = paid.length >= MIN_YEARS ? `, DPS tumbuh ${pct(cagr(a.dps!, b.dps!, b.year - a.year))}/th` : '';
    add(D, 'Konsistensi dividen', `Tahun membagi dividen, ${range(dv)}${g}`, `${paid.length}/${dv.length} tahun`, paid.length === dv.length ? 'good' : 'ok');
  }

  // Audit
  if (d.audit === 'wtp') add(A, 'Opini auditor', 'Seharusnya wajar tanpa modifikasian (WTP)', 'WTP', 'good');
  else if (d.audit === 'other') {
    add(A, 'Opini auditor', 'Seharusnya wajar tanpa modifikasian (WTP)', 'Bukan WTP', 'bad');
    crit.push('Opini auditor bukan WTP. Baca alasan auditor di laporan tahunan.');
  } else add(A, 'Opini auditor', 'Lihat di halaman laporan auditor independen', '—', 'na', 'Belum dicek');

  // Valuasi (dinilai terpisah dari kualitas bisnis)
  const vs: number[] = [];
  const m: Metrics = { price, dps, roe };
  if (fin(price) && fin(eps)) {
    if (eps <= 0) {
      add(V, 'PER (harga ÷ laba per saham)', 'Butuh laba positif', 'Tidak bermakna', 'bad');
      vs.push(0);
    } else {
      m.per = price / eps;
      const s = lo(m.per, 12, 20);
      add(V, 'PER (harga ÷ laba per saham)', '≤12x murah, 12–20x wajar, bandingkan dengan sektornya', mult(price / eps), s, PRICE[s as keyof typeof PRICE]);
      vs.push(PTS[s]!);
    }
  } else miss(V, 'PER (harga ÷ laba per saham)');

  if (fin(price) && fin(eq) && fin(shares) && eq > 0 && shares > 0) {
    const pbv = (m.pbv = price / ((eq * 1000) / shares));
    if (fin(roe) && roe > 0) {
      const fair = roe / 12;
      const s = lo(pbv / fair, 1, 1.5);
      add(V, 'PBV (harga ÷ nilai buku)', `Wajar ≈ ROE ÷ 12% = ${mult(fair)}`, mult(pbv), s, PRICE[s as keyof typeof PRICE]);
      vs.push(PTS[s]!);
    } else add(V, 'PBV (harga ÷ nilai buku)', 'Tidak dinilai karena ROE tidak positif', mult(pbv), 'info');
  } else miss(V, 'PBV (harga ÷ nilai buku)');

  // Yield: informasi, tidak masuk nilai harga.
  const hasPrice = fin(price) && price > 0;
  if (hasPrice && fin(dps)) {
    const y = (m.divYield = (dps / price) * 100);
    add(V, 'Dividend yield', 'Dividen per saham ÷ harga. ≥5% tinggi, 2–5% sedang', pct(y), 'info', y === 0 ? 'Tidak ada' : y >= 5 ? 'Tinggi' : y >= 2 ? 'Sedang' : 'Rendah');
  } else miss(V, 'Dividend yield');
  if (hasPrice && fin(eps)) {
    const y = (m.earningsYield = (eps / price) * 100);
    add(V, 'Earnings yield', 'Laba per saham ÷ harga (kebalikan PER). Bandingkan dengan bunga deposito atau SBN', pct(y), 'info', y >= 8 ? 'Tinggi' : y >= 5 ? 'Sedang' : y > 0 ? 'Rendah' : 'Negatif');
  }
  if (!bank && hasPrice && fin(fcf) && fin(shares) && shares > 0) {
    const y = (m.fcfYield = ((fcf * 1000) / shares / price) * 100);
    add(V, 'FCF yield', 'Free cash flow per saham ÷ harga. Ruang untuk dividen dan ekspansi', pct(y), 'info', y >= 6 ? 'Tinggi' : y >= 3 ? 'Sedang' : y > 0 ? 'Rendah' : 'Negatif');
  }

  // Skor
  const scored = checks.filter((c) => c.group !== V && PTS[c.status] !== undefined);
  let total: number | null = null;
  let grade: Grade | null = null;
  if (scored.length >= 5) {
    total = Math.round((scored.reduce((a, c) => a + PTS[c.status]!, 0) / (scored.length * 2)) * 100);
    if (crit.length) total = Math.min(total, 49);
    grade = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 35 ? 'D' : 'E';
  }
  const avg = vs.length ? vs.reduce((a, b) => a + b) / vs.length : null;
  const priceLabel = avg === null ? null : avg >= 1.75 ? 'Murah' : avg >= 1 ? 'Wajar' : 'Mahal';

  return { metrics: m, trend: T, checks, alerts: [...new Set([...crit, ...flags])], score: total, grade, price: priceLabel, verdict: verdict(grade, priceLabel) };
}

function verdict(grade: Grade | null, price: Result['price']): string {
  if (!grade) return 'Isi minimal data laba rugi, neraca, dan arus kas untuk melihat nilai.';
  if (grade <= 'B') {
    if (!price) return 'Bisnisnya sehat. Isi harga saham untuk menilai apakah harganya masuk akal.';
    return price === 'Mahal'
      ? 'Bisnisnya sehat, tetapi harganya sudah tinggi. Cocok untuk daftar pantau sambil menunggu harga lebih masuk akal.'
      : 'Bisnisnya sehat dan harganya masih masuk akal. Layak diteliti lebih dalam.';
  }
  if (grade === 'C') return 'Ada kekuatan dan kelemahan. Baca catatan atas laporan keuangan sebelum mengambil keputusan.';
  return 'Banyak tanda lemah. Butuh alasan yang sangat kuat untuk berinvestasi di sini.';
}
