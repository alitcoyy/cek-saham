import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Report } from './idx';
import type { Stored } from './types';

/**
 * Penyimpanan hasil olahan: satu file JSON kecil per emiten plus indeks.
 * - Vercel Blob (store private) kalau BLOB_READ_WRITE_TOKEN / BLOB_STORE_ID ada: dipakai Vercel dan `npm run sync`.
 * - Folder .cache/ untuk pemakaian lokal murni; di sini file Excel aslinya juga disimpan untuk /api/debug.
 * Satu tulis per emiten menjaga pemakaian tetap di bawah kuota Blob Hobby (2.000 tulis per bulan).
 */
export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/** Mode lokal menarik ulang dari IDX setelah 7 hari; data di Blob diperbarui lewat `npm run sync`. */
const TTL = 7 * 24 * 60 * 60 * 1000;

/** Indeks: kode → tahun buku terbaru yang tersimpan. Dipakai sync untuk melewati emiten yang sudah terbaru. */
export type Index = Record<string, { year: number; savedAt: number }>;

const DIR = path.join(process.cwd(), '.cache');

async function read(name: string): Promise<string | null> {
  if (!blobEnabled()) return readFile(path.join(DIR, name), 'utf8').catch(() => null);
  const { get } = await import('@vercel/blob');
  const r = await get(name, { access: 'private', useCache: false }).catch(() => null);
  return r?.statusCode === 200 ? new Response(r.stream).text() : null;
}

async function write(name: string, json: string) {
  if (!blobEnabled()) {
    await mkdir(path.dirname(path.join(DIR, name)), { recursive: true });
    return writeFile(path.join(DIR, name), json);
  }
  const { put } = await import('@vercel/blob');
  await put(name, json, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}

const dataName = (code: string) => `data/${code}.json`;
const INDEX = 'data/index.json';

/** Hasil olahan tersimpan untuk satu kode, atau null. */
export async function getStored(code: string, ignoreTtl = false): Promise<Stored | null> {
  const raw = await read(dataName(code));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Stored;
    if (!ignoreTtl && !blobEnabled() && Date.now() - s.savedAt > TTL) return null;
    return s;
  } catch {
    return null;
  }
}

export async function readIndex(): Promise<Index> {
  try {
    return JSON.parse((await read(INDEX)) ?? '{}');
  } catch {
    return {};
  }
}

export const writeIndex = (ix: Index) => write(INDEX, JSON.stringify(ix));

/** Simpan hasil olahan. index=false untuk sync massal, yang menulis indeks sekaligus secara berkala. */
export async function putStored(code: string, s: Stored, index = true) {
  await write(dataName(code), JSON.stringify(s));
  if (index) await writeIndex({ ...(await readIndex()), [code]: { year: s.meta.year, savedAt: s.savedAt } });
}

/** Mode lokal: simpan juga file Excel aslinya untuk /api/debug (tidak dilakukan di Blob, demi kuota). */
export async function saveXlsx(code: string, reports: Report[]) {
  if (blobEnabled()) return;
  await mkdir(path.join(DIR, 'xlsx'), { recursive: true });
  await Promise.all(reports.map((r) => writeFile(path.join(DIR, 'xlsx', `${code}-${r.year}.xlsx`), r.buf)));
}

/** File Excel tersimpan secara lokal (terbaru lebih dulu), untuk /api/debug. */
export async function readXlsx(code: string): Promise<Report[]> {
  const dir = path.join(DIR, 'xlsx');
  const names = (await readdir(dir).catch(() => [])).filter((f) => f.startsWith(`${code}-`) && f.endsWith('.xlsx'));
  const out = await Promise.all(
    names.map(async (f) => ({ year: Number(f.slice(code.length + 1, code.length + 5)), file: f, buf: new Uint8Array(await readFile(path.join(dir, f))) })),
  );
  return out.sort((a, b) => b.year - a.year);
}
