import type { NextRequest } from 'next/server';
import { renderPdf, reportHtml } from '@/lib/pdf';
import { score } from '@/lib/score';
import type { Inputs, Meta, Year } from '@/lib/types';

/** Chromium serverless butuh beberapa detik saat instance baru dinyalakan. */
export const maxDuration = 60;

/** POST /api/pdf { inputs, history, meta } — laporan seperti yang tampil di layar, termasuk koreksi manual. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { inputs?: Inputs; history?: Year[]; meta?: Meta | null } | null;
  if (!body?.inputs || typeof body.inputs !== 'object') return Response.json({ error: 'Data laporan kosong.' }, { status: 400 });
  const inputs = body.inputs;
  const history = Array.isArray(body.history) ? body.history : [];
  const code = String(inputs.ticker ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SAHAM';
  try {
    const html = reportHtml(inputs, score(inputs, history), body.meta ?? null);
    const pdf = await renderPdf(html, `Cek Saham · ${code}${inputs.period ? ` · Tahun buku ${inputs.period}` : ''}`);
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="CekSaham-${code}${inputs.period ? `-${String(inputs.period).replace(/\D/g, '')}` : ''}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'PDF gagal dibuat.' }, { status: 500 });
  }
}
