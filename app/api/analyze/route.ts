import type { NextRequest } from 'next/server';
import { getStored, putStored, saveXlsx } from '@/lib/cache';
import { canFetchIdx, downloadAnnuals, IdxBlocked } from '@/lib/idx';
import { analyze, mergeStored, withPrice } from '@/lib/report';

const clean = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const fail = (error: string, status = 500, blocked = false) => Response.json({ error, blocked }, { status });

export const maxDuration = 60;

/** GET /api/analyze?code=BBCA[&refresh=1] — dari penyimpanan, atau (di komputer sendiri) tarik dari IDX. */
export async function GET(req: NextRequest) {
  const code = clean(req.nextUrl.searchParams.get('code'));
  if (code.length < 4) return fail('Kode saham terdiri dari 4 huruf, misalnya BBCA.', 400);
  try {
    const refresh = canFetchIdx && req.nextUrl.searchParams.has('refresh');
    const stored = refresh ? null : await getStored(code);
    if (stored) return Response.json(await withPrice(stored, 'cache'));
    if (!canFetchIdx)
      return fail(`Laporan ${code} belum tersimpan. Jalankan "npm run sync ${code}" di Mac, atau unggah file Excel laporan keuangan dari idx.co.id di sini.`, 404, true);
    const reports = await downloadAnnuals(code);
    const s = await analyze(code, reports, 'idx');
    await Promise.all([putStored(code, s), saveXlsx(code, reports)]);
    return Response.json(await withPrice(s, 'idx'));
  } catch (e) {
    if (e instanceof IdxBlocked)
      return fail(`${e.message} Klik Cek saham lagi dan selesaikan verifikasi di jendela Chrome, atau unduh file Excel laporan keuangan dari idx.co.id lalu unggah di sini.`, 502, true);
    return fail(e instanceof Error ? e.message : 'Gagal memproses laporan.');
  }
}

/** POST /api/analyze — unggah manual file Excel dari IDX; digabung dengan tahun lain yang sudah tersimpan. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('Pilih file Excel laporan keuangan.', 400);
  // Nama file IDX berpola FinancialStatement-2025-Tahunan-BBCA.xlsx
  const code = clean(form.get('code')) || clean(file.name.match(/-([A-Za-z]{4})\.xlsx?$/)?.[1]);
  if (code.length < 4) return fail('Isi kode saham dulu sebelum mengunggah.', 400);
  const year = Number(file.name.match(/(20\d{2})/)?.[1]) || new Date().getFullYear() - 1;
  try {
    const report = { year, file: file.name, buf: new Uint8Array(await file.arrayBuffer()) };
    const added = await analyze(code, [report], 'upload');
    const old = await getStored(code, true);
    const s = old ? mergeStored(old, added) : added;
    await Promise.all([putStored(code, s), saveXlsx(code, [report])]);
    return Response.json(await withPrice(s, 'upload'));
  } catch (e) {
    return fail(e instanceof Error ? `File tidak bisa dibaca: ${e.message}` : 'File tidak bisa dibaca.', 400);
  }
}
