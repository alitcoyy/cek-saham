import type { NextRequest } from 'next/server';
import { getCached } from '@/lib/cache';
import { readRows } from '@/lib/parse';

/**
 * GET /api/debug?code=BBCA&q=ekuitas[&year=2023]
 * Tampilkan baris dari file Excel yang tersimpan, untuk menyetel pola di lib/parse.ts.
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') ?? '').toUpperCase();
  const q = (req.nextUrl.searchParams.get('q') ?? '').toLowerCase();
  const year = Number(req.nextUrl.searchParams.get('year'));
  const reports = await getCached(code, true);
  const report = reports?.find((r) => r.year === year) ?? reports?.[0];
  if (!report) return Response.json({ error: 'Belum ada file tersimpan. Jalankan /api/analyze dulu.' }, { status: 404 });
  const rows = readRows(report.buf)
    .filter((r) => r.nums.length && (!q || r.text.includes(q)))
    .map(({ sheet, text, nums }) => ({ sheet, text, nums }));
  return Response.json({ file: report.file, count: rows.length, rows: rows.slice(0, 300) });
}
