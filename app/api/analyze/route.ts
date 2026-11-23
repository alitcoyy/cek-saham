import type { NextRequest } from 'next/server';
import { getCached, putCached } from '@/lib/cache';
import { canFetchIdx, downloadAnnuals, IdxBlocked } from '@/lib/idx';
import { buildResponse } from '@/lib/report';

const clean = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const fail = (error: string, status = 500, blocked = false) => Response.json({ error, blocked }, { status });

/** Batas waktu fungsi di Vercel; membaca 3 file dari Blob dan mem-parse-nya cukup beberapa detik. */
export const maxDuration = 60;

/** GET /api/analyze?code=BBCA[&refresh=1] — ambil dari cache atau IDX. */
export async function GET(req: NextRequest) {
  const code = clean(req.nextUrl.searchParams.get('code'));
  if (code.length < 4) return fail('Kode saham terdiri dari 4 huruf, misalnya BBCA.', 400);
  try {
    const refresh = canFetchIdx && req.nextUrl.searchParams.has('refresh');
    const cached = refresh ? null : await getCached(code);
    if (!cached && !canFetchIdx)
      return fail(`${code} belum di-sync. Jalankan "npm run sync ${code}" di Mac, atau unggah file Excel laporan keuangan dari idx.co.id di sini.`, 404, true);
    const reports = cached ?? (await putCached(code, await downloadAnnuals(code)));
    return Response.json(await buildResponse(code, reports, cached ? 'cache' : 'idx'));
  } catch (e) {
    if (e instanceof IdxBlocked)
      return fail(`${e.message} Klik Cek saham lagi dan selesaikan verifikasi di jendela Chrome, atau unduh file Excel laporan keuangan dari idx.co.id lalu unggah di sini.`, 502, true);
    return fail(e instanceof Error ? e.message : 'Gagal memproses laporan.');
  }
}

/** POST /api/analyze — unggah manual file Excel dari IDX (cadangan kalau IDX memblokir). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('Pilih file Excel laporan keuangan.', 400);
  // Nama file IDX berpola FinancialStatement-2025-Tahunan-BBCA.xlsx
  const code = clean(form.get('code')) || clean(file.name.match(/-([A-Za-z]{4})\.xlsx?$/)?.[1]);
  if (code.length < 4) return fail('Isi kode saham dulu sebelum mengunggah.', 400);
  const year = Number(file.name.match(/(20\d{2})/)?.[1]) || new Date().getFullYear() - 1;
  try {
    // Digabung dengan tahun lain yang sudah tersimpan, jadi file lama bisa diunggah satu per satu.
    const reports = await putCached(code, [{ year, file: file.name, buf: new Uint8Array(await file.arrayBuffer()) }], true);
    return Response.json(await buildResponse(code, reports, 'upload'));
  } catch (e) {
    return fail(e instanceof Error ? `File tidak bisa dibaca: ${e.message}` : 'File tidak bisa dibaca.', 400);
  }
}
