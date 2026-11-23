'use client';

import { useState } from 'react';
import { pct } from '@/lib/score';
import { bars, growth, trendMetrics as metrics } from '@/lib/trend';
import type { Year } from '@/lib/types';

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function Trend({ years, bank }: { years: Year[]; bank: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  if (years.length < 3) return null;
  const active = sel ?? years.at(-1)!.year;
  const span = `${years[0].year}–${years.at(-1)!.year}`;

  return (
    <div className="trend">
      <h2>Tren {span}</h2>
      <div className="tcards">
        {metrics(bank).map((m) => {
          const vals = years.map((y) => m.get(y));
          const pts = years.flatMap((y, i) => (fin(vals[i]) ? [[y.year, vals[i]] as [number, number]] : []));
          if (pts.length < 2) return null;
          const { zero, height } = bars(vals);
          const cur = vals[years.findIndex((y) => y.year === active)];
          const g = m.growth ? growth(pts) : null;
          return (
            <div className="tcard" key={m.label}>
              <div className="thead">
                <span>{m.label}</span>
                {g !== null && <em>CAGR {pct(g)}</em>}
              </div>
              <b>{fin(cur) ? m.fmt(cur) : '—'}<small> {active}</small></b>
              <div className="bars" role="group" aria-label={`${m.label} per tahun`}>
                {years.map((y, i) => {
                  const v = vals[i];
                  const h = fin(v) ? height(v) : 0;
                  return (
                    <button
                      key={y.year}
                      type="button"
                      className={y.year === active ? 'on' : undefined}
                      aria-pressed={y.year === active}
                      aria-label={`${y.year}: ${fin(v) ? m.fmt(v) : 'tidak ada data'}`}
                      onClick={() => setSel(y.year)}
                      onMouseEnter={() => setSel(y.year)}
                      onFocus={() => setSel(y.year)}
                    >
                      <span className="plot">
                        <i className="zero" style={{ top: `${zero}%` }} />
                        {fin(v) && (
                          <i
                            className={v < 0 ? 'col neg' : 'col'}
                            style={v < 0 ? { top: `${zero}%`, height: `${h}%` } : { bottom: `${100 - zero}%`, height: `${Math.max(h, 2)}%` }}
                          />
                        )}
                      </span>
                      <span className="yr">’{String(y.year).slice(2)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <details className="ttable">
        <summary>Lihat tabel</summary>
        <div className="scroll">
          <table>
            <thead>
              <tr><th scope="col">Tahun</th>{metrics(bank).map((m) => <th scope="col" key={m.label}>{m.label}</th>)}</tr>
            </thead>
            <tbody>
              {[...years].reverse().map((y) => (
                <tr key={y.year}>
                  <th scope="row">{y.year}</th>
                  {metrics(bank).map((m) => {
                    const v = m.get(y);
                    return <td key={m.label}>{fin(v) ? m.fmt(v) : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
