import path from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';

const BASE = 'https://www.idx.co.id';
const PAGE = `${BASE}/id/perusahaan-tercatat/laporan-keuangan-dan-tahunan/`;
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Profil Chrome sendiri, supaya cookie Cloudflare (cf_clearance) tersimpan antar sesi. */
const PROFILE = path.join(process.cwd(), '.cache', 'chrome-profile');
/** IDX_HEADLESS=1 menyembunyikan jendela, tetapi verifikasi Cloudflare tidak bisa diselesaikan. */
const HEADLESS = process.env.IDX_HEADLESS === '1';
const IDLE_MS = 2 * 60_000;
const VERIFY_MS = HEADLESS ? 30_000 : 3 * 60_000;
const CHALLENGE = /just a moment|tunggu sebentar|attention required/i;

export class IdxBlocked extends Error {}

/** Menarik dari IDX butuh Chrome asli, jadi hanya di komputer sendiri; di Vercel data berasal dari `npm run sync`. */
export const canFetchIdx = !process.env.VERCEL;

export interface Report {
  year: number;
  file: string;
  buf: Uint8Array;
}

interface Session {
  ctx: BrowserContext;
  lock: Promise<unknown>;
  timer?: ReturnType<typeof setTimeout>;
}

// Disimpan di globalThis supaya hot reload tidak membuka Chrome kedua dengan profil yang sama.
const g = globalThis as typeof globalThis & { __idxSession?: Promise<Session> };

async function launch(): Promise<Session> {
  const { chromium } = await import('playwright-core');
  try {
    const ctx = await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome',
      headless: HEADLESS,
      viewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-blink-features=AutomationControlled'],
    });
    return { ctx, lock: Promise.resolve() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/distribution 'chrome' is not found|executable doesn't exist/i.test(msg)) throw new Error('Google Chrome tidak ditemukan. Pasang Chrome dulu, atau unggah file Excel secara manual.');
    if (/processsingleton|singletonlock|already in use/i.test(msg)) throw new Error('Profil Chrome cek-saham sedang dipakai proses lain. Tutup jendela Chrome tersebut lalu coba lagi.');
    throw e;
  }
}

function session(): Promise<Session> {
  if (!g.__idxSession) {
    const p = launch();
    const forget = () => {
      if (g.__idxSession === p) g.__idxSession = undefined;
    };
    g.__idxSession = p;
    p.then((s) => s.ctx.on('close', () => (clearTimeout(s.timer), forget())), forget);
  }
  return g.__idxSession;
}

/** Tutup Chrome sekarang (dipakai skrip sync supaya proses bisa selesai). */
export async function closeIdx() {
  const s = await g.__idxSession?.catch(() => undefined);
  await s?.ctx.close().catch(() => {});
}

/** Jalankan fn di tab IDX satu per satu; Chrome ditutup setelah IDLE_MS tanpa permintaan. */
async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const s = await session();
  const run = s.lock.then(async () => {
    clearTimeout(s.timer);
    try {
      const page = s.ctx.pages().find((p) => !p.isClosed()) ?? (await s.ctx.newPage());
      return await fn(page);
    } finally {
      s.timer = setTimeout(() => s.ctx.close().catch(() => {}), IDLE_MS);
    }
  });
  s.lock = run.catch(() => {});
  return run;
}

/** Buka halaman laporan dan tunggu sampai lolos Cloudflare (otomatis atau diselesaikan manual). */
async function pass(page: Page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const deadline = Date.now() + VERIFY_MS;
  let asked = false;
  while (CHALLENGE.test(await page.title().catch(() => 'just a moment'))) {
    if (page.isClosed()) throw new IdxBlocked('Jendela Chrome ditutup sebelum verifikasi Cloudflare selesai.');
    if (Date.now() > deadline)
      throw new IdxBlocked(HEADLESS
        ? 'Cloudflare meminta verifikasi, padahal Chrome berjalan tanpa jendela (IDX_HEADLESS=1).'
        : 'Verifikasi Cloudflare tidak selesai dalam 3 menit.');
    if (!asked && !HEADLESS) {
      asked = true;
      await page.bringToFront();
      console.log('[idx] Cloudflare meminta verifikasi. Selesaikan di jendela Chrome yang terbuka.');
    }
    await page.waitForTimeout(1000);
  }
}

interface Got {
  status: number;
  type: string;
  body: string;
}

/** fetch dari dalam tab IDX (same-origin, cookie dan sidik jari browser asli). File biner dikembalikan sebagai base64. */
const grab = (page: Page, url: string, binary: boolean) =>
  page.evaluate(
    async ({ url, binary }): Promise<Got> => {
      const res = await fetch(url, { headers: { Accept: binary ? '*/*' : 'application/json' } });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !binary) return { status: res.status, type, body: res.ok ? await res.text() : '' };
      const blob = await res.blob();
      const data = await new Promise<string>((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => no(r.error);
        r.readAsDataURL(blob);
      });
      return { status: res.status, type, body: data.slice(data.indexOf(',') + 1) };
    },
    { url, binary },
  );

async function idxGet(url: string, binary = false): Promise<string> {
  return withPage(async (page) => {
    for (let attempt = 0; ; attempt++) {
      if (attempt || !page.url().startsWith(BASE)) await pass(page);
      const r = await grab(page, url, binary);
      // Cloudflare membalas 403, atau kadang 200 berisi halaman HTML tantangan.
      const blocked = r.status === 403 || (r.status === 200 && /text\/html/i.test(r.type));
      if (!blocked) {
        if (r.status >= 400) throw new Error(`IDX membalas ${r.status}.`);
        return r.body;
      }
      if (attempt) throw new IdxBlocked('IDX masih menolak permintaan setelah verifikasi Cloudflare.');
    }
  });
}

interface Attachment {
  File_Name: string;
  File_Path: string;
}

async function findXlsx(code: string, year: number): Promise<Attachment | undefined> {
  const q = new URLSearchParams({ indexFrom: '0', pageSize: '12', year: String(year), reportType: 'rdf', periode: 'audit', kodeEmiten: code });
  const json = JSON.parse(await idxGet(`${BASE}/primary/ListedCompany/GetFinancialReport?${q}`));
  const files: Attachment[] = (json?.Results ?? []).flatMap((r: { Attachments?: Attachment[] }) => r.Attachments ?? []);
  const xlsx = files.filter((f) => /\.xlsx?$/i.test(f.File_Name));
  return xlsx.find((f) => /financialstatement/i.test(f.File_Name)) ?? xlsx[0];
}

async function fetchAnnual(code: string, year: number): Promise<Report | undefined> {
  const f = await findXlsx(code, year);
  if (!f) return;
  const url = encodeURI(decodeURI(/^https?:/i.test(f.File_Path) ? f.File_Path : BASE + f.File_Path));
  const buf = new Uint8Array(Buffer.from(await idxGet(url, true), 'base64'));
  return { year, file: f.File_Name, buf };
}

/**
 * Ambil laporan tahunan (diaudit) terbaru plus dua laporan lama berselang dua tahun. Setiap file memuat
 * tahun berjalan dan tahun sebelumnya, jadi 3 file (mis. 2025, 2023, 2021) mencakup 6 tahun = tren 5 tahun.
 * Laporan tahun lalu biasanya terbit akhir Maret. File lama bersifat opsional.
 */
export async function downloadAnnuals(code: string): Promise<Report[]> {
  const now = new Date().getFullYear();
  let latest: Report | undefined;
  for (const year of [now - 1, now - 2]) if ((latest = await fetchAnnual(code, year))) break;
  if (!latest) throw new Error(`Laporan tahunan ${code} untuk ${now - 2}–${now - 1} tidak ditemukan di IDX. Cek kode sahamnya.`);
  const out = [latest];
  for (const year of [latest.year - 2, latest.year - 4]) {
    try {
      const r = await fetchAnnual(code, year);
      if (r) out.push(r);
    } catch (e) {
      console.warn(`[idx] Laporan ${code} ${year} dilewati:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
