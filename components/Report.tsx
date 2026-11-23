import type { CSSProperties } from 'react';
import { FIELD_NAMES } from '@/lib/fields';
import { GRADES, GROUPS, mult, pct, rp } from '@/lib/score';
import { PdfButton } from './PdfButton';
import { Trend } from './Trend';
import type { Field, Inputs, Meta, Result } from '@/lib/types';

const SOURCE = { idx: 'baru diambil dari IDX', cache: 'tersimpan di komputer', upload: 'diunggah manual' };
const ROUNDING: Record<number, string> = { 1: 'satuan penuh', 1e3: 'ribuan', 1e6: 'jutaan', 1e9: 'miliaran' };
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const show = (x: number | undefined, f: (n: number) => string) => (fin(x) ? f(x) : '—');

export function Report({ inputs, result, meta }: { inputs: Inputs; result: Result; meta: Meta | null }) {
  const [label, status] = result.grade ? GRADES[result.grade] : ['Data kurang', 'na'];
  const color = { '--c': `var(--${status === 'na' ? 'muted' : status})` } as CSSProperties;
  const m = result.metrics;
  const dy = m.divYield;

  return (
    <section className="card" aria-live="polite">
      <div className="head">
        <div>
          <div className="ticker">{inputs.ticker || 'Tanpa kode'}</div>
          <div className="meta">
            {inputs.sector === 'bank' ? 'Bank' : 'Non-bank'}
            {inputs.period && ` · Tahun buku ${inputs.period}`}
          </div>
        </div>
        <div className="grade" style={color} aria-label={`Nilai ${result.grade ?? 'belum ada'}, ${label}`}>
          <b>{result.grade ?? '?'}</b>
          <span>{label}</span>
        </div>
      </div>

      <p className="verdict">{result.verdict}</p>

      {result.score !== null && (
        <div className="meter" style={color}>
          <div><span>Kualitas bisnis</span><b>{result.score}/100</b></div>
          <div className="track"><i style={{ width: `${result.score}%` }} /></div>
        </div>
      )}

      <PdfButton inputs={inputs} history={result.trend} meta={meta} />

      <div className="kpis">
        <div className="kpi hero">
          <div>
            <span>Dividend yield</span>
            <b>{show(dy, pct)}</b>
            <small>{fin(m.dps) && fin(m.price) ? `DPS ${rp(m.dps)} ÷ harga ${rp(m.price)}` : 'Butuh harga dan dividen per saham'}</small>
          </div>
          {fin(dy) && <span className="tag">{dy === 0 ? 'Tidak ada' : dy >= 5 ? 'Tinggi' : dy >= 2 ? 'Sedang' : 'Rendah'}</span>}
        </div>
        <div className="kpi"><span>Harga</span><b>{show(m.price, rp)}</b></div>
        <div className="kpi"><span>Penilaian harga</span><b>{result.price ?? '—'}</b></div>
        <div className="kpi"><span>Earnings yield</span><b>{show(m.earningsYield, pct)}</b></div>
        <div className="kpi"><span>{inputs.sector === 'bank' ? 'ROE' : 'FCF yield'}</span><b>{inputs.sector === 'bank' ? show(m.roe, pct) : show(m.fcfYield, pct)}</b></div>
        <div className="kpi"><span>PER</span><b>{show(m.per, mult)}</b></div>
        <div className="kpi"><span>PBV</span><b>{show(m.pbv, mult)}</b></div>
      </div>

      <Trend years={result.trend} bank={inputs.sector === 'bank'} />

      {result.alerts.length > 0 && (
        <div className="callout bad" role="note">
          <strong>Tanda bahaya</strong>
          <ul>{result.alerts.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {meta && meta.warnings.length > 0 && (
        <div className="callout warn" role="note">
          <strong>Perlu dicek manual</strong>
          <ul>{meta.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {GROUPS.map((g) => {
        const rows = result.checks.filter((c) => c.group === g);
        return rows.length ? (
          <div className="group" key={g}>
            <h2>{g === 'Valuasi' ? 'Valuasi dan yield' : g}</h2>
            {rows.map((c) => (
              <div className={`row s-${c.status}`} key={c.name}>
                <div>{c.name}<small>{c.ref}</small></div>
                <div className="right">
                  <span className="val">{c.value}</span>
                  <span className="pill">{c.label}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null;
      })}

      {meta && (
        <details className="source">
          <summary>Sumber angka</summary>
          <p>{meta.files.join(', ')}, {SOURCE[meta.source]}. Mata uang {meta.currency}, pembulatan {ROUNDING[meta.rounding] ?? meta.rounding}. Baris yang dipakai:</p>
          <ul>
            {Object.entries(meta.matched).map(([f, text]) => (
              <li key={f}><b>{FIELD_NAMES[f as Field]}</b>: {text}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="note">
        Penilaian memakai patokan umum dan data beberapa tahun dari laporan IDX, jadi hasilnya titik awal riset, bukan rekomendasi beli atau jual.
        Dividend yield memakai dividen yang dibayar selama tahun buku, bukan perkiraan dividen berikutnya.
      </p>
    </section>
  );
}
