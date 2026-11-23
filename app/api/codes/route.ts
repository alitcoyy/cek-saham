import { storedCodes } from '@/lib/cache';

/** GET /api/codes — kode saham yang sudah tersimpan, untuk tombol cepat. */
export async function GET() {
  return Response.json({ codes: await storedCodes() }, { headers: { 'Cache-Control': 'no-store' } });
}
