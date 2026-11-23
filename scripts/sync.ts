/**
 * Tarik laporan dari IDX lewat Chrome di Mac lalu simpan ke Vercel Blob, supaya bisa dibuka dari HP.
 *
 *   npm run sync BBCA TLKM   → tarik kode tertentu
 *   npm run sync             → perbarui semua kode yang sudah tersimpan (mis. setelah laporan tahunan baru terbit)
 *
 * Butuh BLOB_READ_WRITE_TOKEN di .env.local (Vercel → Storage → store Blob → .env.local).
 */
import { putCached, storedCodes, blobEnabled } from '../lib/cache';
import { closeIdx, downloadAnnuals, IdxBlocked } from '../lib/idx';

try {
  process.loadEnvFile('.env.local');
} catch {
  // tidak ada .env.local
}

async function main() {
  if (!blobEnabled()) {
    console.error('BLOB_READ_WRITE_TOKEN belum ada di .env.local. Salin dari Vercel → Storage → store Blob → tab .env.local.');
    process.exit(1);
  }
  const args = process.argv.slice(2).map((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')).filter((s) => s.length >= 4);
  const codes = args.length ? args : await storedCodes();
  if (!codes.length) {
    console.error('Belum ada kode tersimpan. Contoh: npm run sync BBCA TLKM');
    process.exit(1);
  }

  let failed = 0;
  for (const code of codes) {
    process.stdout.write(`${code}: menarik laporan… `);
    try {
      const reports = await putCached(code, await downloadAnnuals(code));
      console.log(`tersimpan (${reports.map((r) => r.year).join(', ')})`);
    } catch (e) {
      failed++;
      console.log(e instanceof IdxBlocked ? `diblokir IDX: ${e.message}` : `gagal: ${e instanceof Error ? e.message : e}`);
    }
  }
  await closeIdx();
  console.log(failed ? `Selesai, ${failed} gagal.` : 'Selesai.');
  process.exit(failed ? 1 : 0);
}

main();
