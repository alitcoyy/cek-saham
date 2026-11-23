'use client';

import { useState } from 'react';
import type { Inputs, Meta, Year } from '@/lib/types';

/** Minta PDF dari server (data yang sedang tampil, termasuk koreksi manual) lalu unduh. */
export function PdfButton({ inputs, history, meta }: { inputs: Inputs; history: Year[]; meta: Meta | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs, history, meta }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'PDF gagal dibuat.');
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `CekSaham-${inputs.ticker || 'saham'}${inputs.period ? `-${inputs.period}` : ''}.pdf` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF gagal dibuat.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions">
      <button type="button" className="btn-ghost" onClick={download} disabled={busy}>
        {busy ? <span className="spin" aria-hidden /> : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        )}
        {busy ? 'Menyiapkan PDF…' : 'Unduh PDF'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
