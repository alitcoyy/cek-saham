/**
 * Tarik laporan dari IDX lewat Chrome di Mac, olah, lalu simpan ke Vercel Blob supaya bisa dibuka dari HP.
 *
 *   npm run sync HRTA BBCA   → tarik kode tertentu (selalu ditarik ulang)
 *   npm run sync all         → semua emiten BEI; yang sudah terbaru dilewati, jadi aman dihentikan (Ctrl+C) lalu dilanjutkan
 *   npm run sync             → perbarui emiten yang sudah tersimpan kalau laporan tahun berikutnya sudah terbit
 *   npm run sync all force   → tarik ulang semua (pakai seperlunya, menghabiskan kuota tulis Blob)
 *
 * Butuh BLOB_READ_WRITE_TOKEN di .env.local.
 */
import { blobEnabled, putStored, readIndex, writeIndex, type Index } from '../lib/cache';
import { closeIdx, downloadAnnuals, hasAnnual, IdxBlocked, listEmiten } from '../lib/idx';
import { analyze } from '../lib/report';

try {
  process.loadEnvFile('.env.local');
} catch {
  // tidak ada .env.local
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAUSE_MS = 500; // jeda antar emiten supaya tidak membebani IDX
const SAVE_EVERY = 25; // indeks ditulis berkala: hemat kuota, tetap bisa dilanjutkan

let index: Index = {};
let dirty = 0;
const flush = async () => {
  if (!dirty) return;
  await writeIndex(index);
  dirty = 0;
};

/** Perlu ditarik? Sudah berisi laporan tahun lalu → tidak. Belum, tapi laporan berikutnya belum terbit → tidak. */
async function needed(code: string, expected: number) {
  const have = index[code]?.year;
  if (!have) return true;
  if (have >= expected) return false;
  return hasAnnual(code, have + 1);
}

async function main() {
  if (!blobEnabled()) {
    console.error('BLOB_READ_WRITE_TOKEN belum ada di .env.local. Salin dari Vercel → Storage → store Blob.');
    process.exit(1);
  }
  const words = process.argv.slice(2).map((s) => s.toLowerCase().replace(/^-+/, ''));
  const all = words.includes('all');
  const force = words.includes('force');
  const explicit = words.filter((w) => w !== 'all' && w !== 'force').map((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')).filter((s) => s.length >= 4);

  index = await readIndex();
  const expected = new Date().getFullYear() - 1;
  let codes = explicit;
  if (all) {
    process.stdout.write('Mengambil daftar emiten dari IDX… ');
    codes = await listEmiten();
    console.log(`${codes.length} emiten.`);
    if (!codes.length) throw new Error('Daftar emiten kosong. Format respons IDX mungkin berubah.');
  } else if (!codes.length) {
    codes = Object.keys(index).sort();
    if (!codes.length) {
      console.error('Belum ada emiten tersimpan. Contoh: npm run sync HRTA BBCA, atau npm run sync all');
      process.exit(1);
    }
  }

  process.on('SIGINT', async () => {
    console.log('\nDihentikan. Menyimpan kemajuan…');
    await flush().catch(() => {});
    await closeIdx();
    console.log('Jalankan perintah yang sama lagi untuk melanjutkan.');
    process.exit(130);
  });

  const t0 = Date.now();
  const tally = { tersimpan: 0, dilewati: 0, 'tanpa laporan': 0, gagal: 0 };
  for (const [i, code] of codes.entries()) {
    const tag = `[${i + 1}/${codes.length}] ${code}:`;
    try {
      if (!explicit.length && !force && !(await needed(code, expected))) {
        tally.dilewati++;
        continue;
      }
      const reports = await downloadAnnuals(code);
      const s = await analyze(code, reports, 'idx');
      await putStored(code, s, false);
      index[code] = { year: s.meta.year, savedAt: s.savedAt };
      if (++dirty >= SAVE_EVERY) await flush();
      tally.tersimpan++;
      const done = i + 1;
      const eta = Math.round(((Date.now() - t0) / done) * (codes.length - done) / 60000);
      console.log(`${tag} tersimpan (${reports.map((r) => r.year).join(', ')})${codes.length > 5 ? ` · sisa ±${eta} menit` : ''}`);
    } catch (e) {
      if (e instanceof IdxBlocked) {
        await flush();
        console.error(`${tag} diblokir IDX: ${e.message}\nKemajuan tersimpan. Jalankan perintah yang sama lagi untuk melanjutkan.`);
        await closeIdx();
        process.exit(2);
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/tidak ditemukan/.test(msg)) {
        tally['tanpa laporan']++;
        console.log(`${tag} belum ada laporan tahunan Excel di IDX, dilewati`);
      } else {
        tally.gagal++;
        console.log(`${tag} gagal: ${msg}`);
      }
    }
    await sleep(PAUSE_MS);
  }
  await flush();
  await closeIdx();
  console.log(`Selesai: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
  process.exit(tally.gagal ? 1 : 0);
}

main().catch(async (e) => {
  await flush().catch(() => {});
  await closeIdx();
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
