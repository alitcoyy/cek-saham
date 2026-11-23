import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Report } from './idx';

/**
 * Penyimpanan laporan. Dua tempat, dipilih otomatis:
 * - Vercel Blob (store private) kalau BLOB_READ_WRITE_TOKEN / BLOB_STORE_ID ada, dipakai di Vercel dan oleh
 *   `npm run sync` di Mac supaya data yang ditarik lewat Chrome bisa dibaca dari HP;
 * - folder .cache/ untuk pemakaian lokal murni.
 */
export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/** Laporan tahunan jarang berubah; setelah 7 hari mode lokal menarik ulang dari IDX. Blob tidak kedaluwarsa. */
const TTL = 7 * 24 * 60 * 60 * 1000;

interface CacheMeta {
  savedAt: number;
  files: { year: number; file: string }[];
}

interface Backend {
  read(code: string, name: string): Promise<Uint8Array | null>;
  write(code: string, name: string, data: Uint8Array | string): Promise<void>;
  codes(): Promise<string[]>;
}

const DIR = path.join(process.cwd(), '.cache');
// Nama file lama dipertahankan: BBCA.json dan BBCA-2025.xlsx.
const fsName = (code: string, name: string) => path.join(DIR, name === 'meta.json' ? `${code}.json` : `${code}-${name}`);

const fsBackend: Backend = {
  read: (code, name) => readFile(fsName(code, name)).then((b) => new Uint8Array(b), () => null),
  async write(code, name, data) {
    await mkdir(DIR, { recursive: true });
    await writeFile(fsName(code, name), data);
  },
  async codes() {
    const files = await readdir(DIR).catch(() => []);
    return files.flatMap((f) => /^([A-Z0-9]{4,6})\.json$/.exec(f)?.[1] ?? []);
  },
};

const BLOB_OPTS = { access: 'private', addRandomSuffix: false, allowOverwrite: true } as const;
const INDEX = 'reports/index.json';

async function blobRead(pathname: string): Promise<Uint8Array | null> {
  const { get } = await import('@vercel/blob');
  const r = await get(pathname, { access: 'private', useCache: false });
  return r?.statusCode === 200 ? new Uint8Array(await new Response(r.stream).arrayBuffer()) : null;
}

const blobBackend: Backend = {
  read: (code, name) => blobRead(`reports/${code}/${name}`),
  async write(code, name, data) {
    const { put } = await import('@vercel/blob');
    const json = typeof data === 'string';
    await put(`reports/${code}/${name}`, json ? data : Buffer.from(data), {
      ...BLOB_OPTS,
      contentType: json ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    if (!json) return;
    // Daftar kode disimpan di satu file supaya halaman depan cukup satu kali baca, tanpa operasi list.
    const codes = new Set(await this.codes());
    if (codes.has(code)) return;
    codes.add(code);
    await put(INDEX, JSON.stringify([...codes].sort()), { ...BLOB_OPTS, contentType: 'application/json' });
  },
  async codes() {
    const raw = await blobRead(INDEX).catch(() => null);
    return raw ? JSON.parse(new TextDecoder().decode(raw)) : [];
  },
};

const store = (): Backend => (blobEnabled() ? blobBackend : fsBackend);

async function readMeta(code: string): Promise<CacheMeta | null> {
  try {
    const raw = await store().read(code, 'meta.json');
    const meta = raw && JSON.parse(new TextDecoder().decode(raw));
    return Array.isArray(meta?.files) ? meta : null; // format lama (satu file) dianggap kosong
  } catch {
    return null;
  }
}

/** Semua laporan tersimpan untuk satu kode, terbaru lebih dulu. */
export async function getCached(code: string, ignoreTtl = false): Promise<Report[] | null> {
  const meta = await readMeta(code);
  if (!meta?.files.length || (!ignoreTtl && !blobEnabled() && Date.now() - meta.savedAt > TTL)) return null;
  const out = await Promise.all(meta.files.map(async (f) => ({ ...f, buf: await store().read(code, `${f.year}.xlsx`) })));
  if (out.some((r) => !r.buf)) return null;
  return (out as Report[]).sort((a, b) => b.year - a.year);
}

/** Simpan laporan. merge=true mempertahankan tahun lain yang sudah tersimpan (untuk unggahan manual). */
export async function putCached(code: string, reports: Report[], merge = false): Promise<Report[]> {
  const old = merge ? ((await getCached(code, true)) ?? []) : [];
  const years = new Set(reports.map((r) => r.year));
  const all = [...reports, ...old.filter((r) => !years.has(r.year))].sort((a, b) => b.year - a.year);
  await Promise.all(reports.map((r) => store().write(code, `${r.year}.xlsx`, r.buf)));
  const meta: CacheMeta = { savedAt: Date.now(), files: all.map(({ year, file }) => ({ year, file })) };
  await store().write(code, 'meta.json', JSON.stringify(meta));
  return all;
}

/** Kode yang sudah tersimpan, untuk tombol cepat di halaman depan. */
export const storedCodes = () => store().codes().catch(() => [] as string[]);
