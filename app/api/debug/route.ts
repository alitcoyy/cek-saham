import type { NextRequest } from 'next/server';
import { readXlsx } from '@/lib/cache';
import { readRows } from '@/lib/parse';

/**
 * GET /api/debug?code=BBCA&q=ekuitas[&year=2023]
 * Tampilkan baris dari file Excel yang tersimpan secara lokal, untuk menyetel pola di lib/parse.ts.
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') ?? '').toUpperCase();
  const q = (req.nextUrl.searchParams.get('q') ?? '').toLowerCase();
  const year = Number(req.nextUrl.searchParams.get('year'));
  const reports = await readXlsx(code);
  const report = reports.find((r) => r.year === year) ?? reports[0];
  if (!report) return Response.json({ error: 'Belum ada file Excel lokal. Jalankan /api/analyze di komputer tanpa token Blob dulu.' }, { status: 404 });
  const rows = readRows(report.buf)
    .filter((r) => r.nums.length && (!q || r.text.includes(q)))
    .map(({ sheet, text, nums }) => ({ sheet, text, nums }));
  return Response.json({ file: report.file, count: rows.length, rows: rows.slice(0, 300) });
}
