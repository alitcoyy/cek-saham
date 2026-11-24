import { readIndex } from '@/lib/cache';

/** GET /api/codes — kode saham yang sudah tersimpan beserta tahun buku terbarunya. */
export async function GET() {
  return Response.json({ codes: await readIndex() }, { headers: { 'Cache-Control': 'no-store' } });
}
