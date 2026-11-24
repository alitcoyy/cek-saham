'use client';

import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import { InputsForm } from '@/components/InputsForm';
import { Report } from '@/components/Report';
import { fromForm, toForm } from '@/lib/fields';
import { score } from '@/lib/score';
import type { AnalyzeResponse, Meta, Year } from '@/lib/types';

/** Tombol cepat awal; selanjutnya diganti saham yang terakhir dicek di perangkat ini. */
const QUICK = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'ICBP'];
const RECENT_KEY = 'cek-saham:recent';
const NONE: string[] = [];

/** 8 saham terakhir yang dicek di perangkat ini, disimpan di browser. */
const recent = (() => {
  const listeners = new Set<() => void>();
  let cache: string[] | null = null;
  const get = () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    } catch {
      cache = [];
    }
    return cache!;
  };
  return {
    get,
    server: () => NONE,
    subscribe: (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn)),
    add(c: string) {
      cache = [c, ...get().filter((x) => x !== c)].slice(0, 8);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(cache));
      } catch {
        // penyimpanan browser tidak tersedia
      }
      listeners.forEach((fn) => fn());
    },
  };
})();
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export default function Home() {
  const [code, setCode] = useState('');
  const [form, setForm] = useState(() => toForm({}));
  const [meta, setMeta] = useState<Meta | null>(null);
  const [history, setHistory] = useState<Year[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputs = useMemo(() => fromForm(form), [form]);
  const result = useMemo(() => score(inputs, history), [inputs, history]);

  const recentCodes = useSyncExternalStore(recent.subscribe, recent.get, recent.server);
  const quick = recentCodes.length ? recentCodes : QUICK;

  async function load(req: () => Promise<Response>) {
    setBusy(true);
    setError('');
    try {
      const res = await req();
      const json = await res.json();
      if (!res.ok) return setError(json.error);
      const data = json as AnalyzeResponse;
      setForm(toForm(data.inputs));
      setMeta(data.meta);
      setHistory(data.history ?? []);
      recent.add(data.inputs.ticker);
      setCode(data.inputs.ticker);
    } catch {
      setError('Server tidak merespons. Pastikan npm run dev masih berjalan.');
    } finally {
      setBusy(false);
    }
  }

  const check = (c: string) => {
    if (c.length < 4 || busy) return;
    setCode(c);
    load(() => fetch(`/api/analyze?code=${c}`));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur(); // tutup keyboard di HP
    check(code);
  };

  const upload = (file?: File) => {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    body.append('code', code);
    load(() => fetch('/api/analyze', { method: 'POST', body }));
  };

  return (
    <main className="wrap">
      <header className="top">
        <h1>Cek Saham</h1>
        <p>Kesehatan emiten BEI dari tren laporan keuangan 5 tahun terakhir.</p>
      </header>

      <div className="bar">
        <form className="search" role="search" onSubmit={submit}>
          <input
            aria-label="Kode saham"
            placeholder="Kode saham, mis. BBCA"
            value={code}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => setCode(clean(e.target.value))}
          />
          <button className="btn" disabled={busy || code.length < 4} aria-label={busy ? 'Memuat' : 'Cek saham'}>
            {busy ? <span className="spin" aria-hidden /> : 'Cek'}
          </button>
        </form>
      </div>

      <div className="quick" aria-label="Pilihan cepat">
        {quick.map((c) => (
          <button key={c} type="button" className="chip" disabled={busy} onClick={() => check(c)}>{c}</button>
        ))}
        <label className="chip ghost">
          Unggah Excel IDX
          <input className="sr" type="file" accept=".xlsx,.xls" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="grid">
        {busy ? (
          <section className="card loading" aria-live="polite">
            <div className="spin" aria-hidden />
            <b>Mengambil laporan {code}…</b>
            <p>Kalau jendela Chrome di komputer meminta verifikasi Cloudflare, selesaikan di sana. Aplikasi menunggu hingga 3 menit.</p>
          </section>
        ) : meta || form.ticker ? (
          <Report inputs={inputs} result={result} meta={meta} />
        ) : (
          <section className="card empty">
            <b>Mulai dengan kode saham</b>
            <p>Ketik kode emiten atau pilih salah satu di atas. Laporan 5 tahun terakhir diambil dari IDX lalu dinilai otomatis.</p>
          </section>
        )}
        <InputsForm form={form} onChange={setForm} />
      </div>
    </main>
  );
}
