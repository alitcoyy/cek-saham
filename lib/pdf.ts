import { GRADES, GROUPS, mult, pct, rp } from './score';
import { bars, growth, trendMetrics } from './trend';
import type { Inputs, Meta, Result, Status } from './types';

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const show = (x: number | undefined, f: (n: number) => string) => (fin(x) ? f(x) : '—');

const COLOR: Record<Status, string> = { good: '#15803d', ok: '#b45309', bad: '#c2410c', na: '#77777a', info: '#3f5f8a' };
const SOURCE = { idx: 'diambil dari IDX', cache: 'diambil dari IDX (cache)', upload: 'diunggah manual' };
const ROUNDING: Record<number, string> = { 1: 'satuan penuh', 1e3: 'ribuan', 1e6: 'jutaan', 1e9: 'miliaran' };

/** Gaya cetak: tema yang sama dengan situs (putih, tinta gelap, aksen hijau), diukur untuk A4. */
const CSS = `
@page { size: A4; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #141414; font: 9.5pt/1.45 'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, sans-serif; font-variant-numeric: tabular-nums; }
.muted { color: #77777a; }
h2 { font-size: 7.5pt; font-weight: 700; color: #77777a; text-transform: uppercase; letter-spacing: 0.12em; margin: 18px 0 8px; break-after: avoid; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid #ececea; }
.brand { font-size: 8pt; font-weight: 700; letter-spacing: 0.04em; color: #77777a; }
h1 { font-size: 28pt; line-height: 1; margin: 6px 0 4px; font-weight: 800; letter-spacing: -0.01em; }
.meta { font-size: 8.5pt; color: #77777a; }
.grade { width: 64px; height: 64px; border-radius: 16px; display: flex; flex-direction: column; justify-content: center; align-items: center;
  color: var(--c); background: color-mix(in srgb, var(--c) 9%, #fff); border: 1px solid color-mix(in srgb, var(--c) 20%, #fff); }
.grade b { font-size: 24pt; line-height: 1; font-weight: 800; }
.grade span { font-size: 6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 3px; text-align: center; }
.verdict { font-size: 10.5pt; margin: 12px 0 0; color: #3d3d3d; }
.meter { display: flex; align-items: center; gap: 12px; margin-top: 10px; font-size: 8.5pt; color: #77777a; }
.meter .track { flex: 1; height: 5px; border-radius: 99px; background: #f1f1ee; overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--c); border-radius: inherit; }
.meter b { color: #141414; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 6px; }
.kpis.first { margin-top: 14px; }
.kpi { background: #f6f6f4; border-radius: 10px; padding: 8px 10px; }
.kpi span { display: block; font-size: 7.5pt; color: #77777a; }
.kpi b { display: block; font-size: 12pt; font-weight: 700; margin-top: 1px; }
.kpi.hero { grid-column: span 2; grid-row: span 2; background: #effaf5; border: 1px solid #d6efe4; padding: 12px 14px; display: flex; flex-direction: column; justify-content: center; }
.kpi.hero b { font-size: 26pt; line-height: 1.05; color: #0d7a5f; letter-spacing: -0.02em; }
.kpi.hero small { font-size: 7.5pt; color: #77777a; margin-top: 4px; }
.kpi.hero em { font-style: normal; font-size: 7.5pt; font-weight: 700; color: #0d7a5f; }
.callout { border-radius: 10px; padding: 8px 12px; margin-top: 10px; font-size: 8.5pt; break-inside: avoid; }
.callout.bad { background: #fff4ed; border: 1px solid #fed7aa; }
.callout.warn { background: #fffbeb; border: 1px solid #fde68a; }
.callout strong { display: block; margin-bottom: 2px; }
.callout ul { margin: 0; padding-left: 16px; }
.tcards { display: grid; gap: 6px; }
.tcard { border: 1px solid #ececea; border-radius: 10px; padding: 8px 10px 6px; break-inside: avoid; }
.thead { font-size: 7.5pt; color: #77777a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cg { font-size: 7pt; color: #3d3d3d; font-weight: 600; min-height: 1.4em; }
.tcard > b { display: block; font-size: 11pt; margin-top: 1px; }
.tcard > b small { font-size: 7pt; font-weight: 500; color: #77777a; }
.bars { display: flex; margin-top: 6px; }
.bars > div { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.plot { position: relative; width: 100%; height: 38px; }
.plot .zero { position: absolute; left: 0; right: 0; height: 1px; background: #ececea; }
.plot .col { position: absolute; left: 50%; transform: translateX(-50%); width: 14px; background: #cfe5dc; border-radius: 3px 3px 0 0; }
.plot .col.neg { background: #f6cdbb; border-radius: 0 0 3px 3px; }
.plot .col.on { background: #0d7a5f; }
.plot .col.on.neg { background: #c2410c; }
.yr { font-size: 6.5pt; color: #77777a; }
table { width: 100%; border-collapse: collapse; }
.ttable { margin-top: 8px; font-size: 8pt; }
.ttable th, .ttable td { padding: 4px 6px; text-align: right; border-bottom: 1px solid #ececea; white-space: nowrap; }
.ttable th:first-child, .ttable td:first-child { text-align: left; }
.ttable thead th { font-size: 7pt; color: #77777a; font-weight: 600; }
.checks td { padding: 4px 0; border-bottom: 1px solid #ececea; vertical-align: top; line-height: 1.35; }
.checks tr { break-inside: avoid; }
.checks .g td { padding: 10px 0 3px; border-bottom: 0; font-size: 7.5pt; font-weight: 700; color: #77777a; text-transform: uppercase; letter-spacing: 0.12em; }
.checks small { display: block; color: #77777a; font-size: 7.5pt; }
.checks .v { text-align: right; font-weight: 700; white-space: nowrap; padding-left: 12px; }
.checks .s { text-align: right; width: 76px; padding-left: 10px; }
.pill { display: inline-block; font-size: 7pt; font-weight: 700; padding: 1px 7px; border-radius: 99px; color: var(--s); background: color-mix(in srgb, var(--s) 11%, #fff); white-space: nowrap; }
.details { break-before: page; }
.details h2 { margin-top: 0; }
.source { margin-top: 16px; padding-top: 10px; border-top: 1px solid #ececea; font-size: 7.5pt; color: #77777a; break-inside: avoid; }
.source ul { margin: 4px 0 0; padding-left: 14px; overflow-wrap: anywhere; }
.note { font-size: 7.5pt; color: #77777a; margin-top: 10px; }
`;

function trendSection(r: Result, bank: boolean): string {
  const years = r.trend;
  if (years.length < 3) return '';
  const last = years.at(-1)!.year;
  const ms = trendMetrics(bank);
  const cards = ms
    .map((m) => {
      const vals = years.map((y) => m.get(y));
      const pts = years.flatMap((y, i) => (fin(vals[i]) ? [[y.year, vals[i]] as [number, number]] : []));
      if (pts.length < 2) return '';
      const { zero, height } = bars(vals);
      const g = m.growth ? growth(pts) : null;
      const cur = vals.at(-1);
      const cols = years
        .map((y, i) => {
          const v = vals[i];
          const bar = !fin(v)
            ? ''
            : `<i class="col${v < 0 ? ' neg' : ''}${y.year === last ? ' on' : ''}" style="${v < 0 ? `top:${zero}%;height:${height(v)}%` : `bottom:${100 - zero}%;height:${Math.max(height(v), 2)}%`}"></i>`;
          return `<div><span class="plot"><i class="zero" style="top:${zero}%"></i>${bar}</span><span class="yr">’${String(y.year).slice(2)}</span></div>`;
        })
        .join('');
      return `<div class="tcard"><div class="thead">${esc(m.label)}</div>
        <b>${fin(cur) ? esc(m.fmt(cur)) : '—'} <small>${last}</small></b>
        <div class="cg">${g === null ? '' : `CAGR ${esc(pct(g))}/th`}</div><div class="bars">${cols}</div></div>`;
    })
    .join('');
  const head = ms.map((m) => `<th>${esc(m.label)}</th>`).join('');
  const rows = [...years]
    .reverse()
    .map((y) => `<tr><td><b>${y.year}</b></td>${ms.map((m) => { const v = m.get(y); return `<td>${fin(v) ? esc(m.fmt(v)) : '—'}</td>`; }).join('')}</tr>`)
    .join('');
  const n = cards.split('class="tcard"').length - 1;
  return `<section><h2>Tren ${years[0].year}–${last}</h2><div class="tcards" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${cards}</div>
    <table class="ttable"><thead><tr><th>Tahun</th>${head}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

/** Halaman HTML laporan untuk dicetak ke PDF. Semua teks di-escape karena sebagian berasal dari file Excel. */
export function reportHtml(d: Inputs, r: Result, meta: Meta | null, now = new Date()): string {
  const [label, status] = r.grade ? GRADES[r.grade] : ['Data kurang', 'na' as Status];
  const c = COLOR[status];
  const m = r.metrics;
  const bank = d.sector === 'bank';
  const dy = m.divYield;
  const kpi = (k: string, v: string) => `<div class="kpi"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const list = (title: string, cls: string, items: string[]) =>
    items.length ? `<div class="callout ${cls}"><strong>${title}</strong><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';

  const checks = GROUPS.map((g) => {
    const rows = r.checks.filter((x) => x.group === g);
    if (!rows.length) return '';
    return `<tr class="g"><td colspan="3">${g === 'Valuasi' ? 'Valuasi dan yield' : esc(g)}</td></tr>${rows
      .map((x) => `<tr><td>${esc(x.name)}<small>${esc(x.ref)}</small></td><td class="v">${esc(x.value)}</td><td class="s"><span class="pill" style="--s:${COLOR[x.status]}">${esc(x.label)}</span></td></tr>`)
      .join('')}`;
  }).join('');

  const source = meta
    ? `<div class="source"><b>Sumber angka:</b> ${esc(meta.files.join(', '))}, ${SOURCE[meta.source]}. Mata uang ${esc(meta.currency)}, pembulatan ${esc(ROUNDING[meta.rounding] ?? meta.rounding)}.</div>`
    : '';

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Cek Saham ${esc(d.ticker)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<header class="top"><div>
  <div class="brand">CEK SAHAM · LAPORAN KESEHATAN EMITEN</div>
  <h1>${esc(d.ticker || 'Tanpa kode')}</h1>
  <div class="meta">${bank ? 'Bank' : 'Non-bank'}${d.period ? ` · Tahun buku ${esc(d.period)}` : ''} · Dibuat ${esc(now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
</div><div class="grade" style="--c:${c}"><b>${r.grade ?? '?'}</b><span>${esc(label)}</span></div></header>
<p class="verdict">${esc(r.verdict)}</p>
${r.score !== null ? `<div class="meter" style="--c:${c}"><span>Kualitas bisnis</span><div class="track"><i style="width:${r.score}%"></i></div><b>${r.score}/100</b></div>` : ''}
<div class="kpis first">
  <div class="kpi hero"><span>Dividend yield</span><b>${esc(show(dy, pct))}</b>
    <small>${fin(m.dps) && fin(m.price) ? `DPS ${esc(rp(m.dps))} ÷ harga ${esc(rp(m.price))}` : 'Butuh harga dan dividen per saham'}</small>
    ${fin(dy) ? `<em>${dy === 0 ? 'Tidak ada' : dy >= 5 ? 'Tinggi' : dy >= 2 ? 'Sedang' : 'Rendah'}</em>` : ''}</div>
  ${kpi('Harga', show(m.price, rp))}${kpi('Penilaian harga', r.price ?? '—')}
  ${kpi('PER', show(m.per, mult))}${kpi('PBV', show(m.pbv, mult))}
</div>
<div class="kpis">
  ${kpi('Earnings yield', show(m.earningsYield, pct))}
  ${bank ? kpi('Net profit margin', fin(d.ni) && fin(d.rev) && d.rev > 0 ? pct((d.ni / d.rev) * 100) : '—') : kpi('FCF yield', show(m.fcfYield, pct))}
  ${kpi('ROE tahun terakhir', show(m.roe, pct))}${kpi('Nilai', r.score === null ? '—' : `${r.grade} · ${r.score}/100`)}
</div>
${list('Tanda bahaya', 'bad', r.alerts)}${list('Perlu dicek manual', 'warn', meta?.warnings ?? [])}
${trendSection(r, bank)}
<section class="details"><h2>Rincian penilaian</h2><table class="checks"><tbody>${checks}</tbody></table></section>
${source}
<p class="note">Penilaian memakai patokan umum dan data beberapa tahun dari laporan IDX, jadi hasilnya titik awal riset, bukan rekomendasi beli atau jual. Dividend yield memakai dividen yang dibayar selama tahun buku, bukan perkiraan dividen berikutnya.</p>
</body></html>`;
}

/**
 * Cetak HTML ke PDF A4 dengan Chrome headless, terpisah dari sesi IDX (tanpa jendela, tanpa profil).
 * Di komputer sendiri memakai Google Chrome yang terpasang; di Vercel memakai Chromium serverless (@sparticuz/chromium).
 */
export async function renderPdf(html: string, footer: string): Promise<Uint8Array> {
  const { chromium } = await import('playwright-core');
  let cleanup = async () => {};
  const open = async () => {
    if (!process.env.VERCEL) return (await chromium.launch({ channel: 'chrome', headless: true })).newContext();
    const { default: serverless } = await import('@sparticuz/chromium');
    // Profil unik per pemanggilan, karena /tmp tidak dibersihkan di instance yang dipakai ulang.
    const dir = `/tmp/pw-${crypto.randomUUID()}`;
    cleanup = () => import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true }));
    return chromium.launchPersistentContext(dir, { args: serverless.args, executablePath: await serverless.executablePath(), headless: true });
  };
  const ctx = await open().catch((e: Error) => {
    throw new Error(/is not found|doesn't exist/i.test(e.message) ? 'Google Chrome tidak ditemukan, PDF tidak bisa dibuat.' : e.message);
  });
  try {
    const page = await ctx.newPage();
    // Font dari Google Fonts; kalau offline, jatuh ke font sistem.
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready.then(() => true));
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;padding:0 14mm;font:7px -apple-system,'Segoe UI',sans-serif;color:#9a9a9a;display:flex;justify-content:space-between"><span>${esc(footer)}</span><span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await ctx.close();
    await ctx.browser()?.close();
    await cleanup().catch(() => {});
  }
}
