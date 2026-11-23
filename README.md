# Cek Kesehatan Saham

Aplikasi pribadi untuk menilai saham BEI dari tren laporan keuangan tahunan 5 tahun terakhir. Masukkan kode saham, aplikasi mengambil file Excel laporan keuangan dari IDX, membaca neraca, laba rugi, dan arus kas, lalu memberi nilai A–E plus penilaian harga.

## Menjalankan

Butuh Node.js 20 atau lebih baru dan Google Chrome yang sudah terpasang (tidak ada browser yang diunduh).

```bash
npm install
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm run dev
```

Buka http://localhost:3000. Untuk membuka dari HP, sambungkan HP ke Wi-Fi yang sama lalu buka alamat "Network" yang dicetak `npm run dev` (misalnya http://192.168.1.10:3000). Jendela Chrome untuk verifikasi Cloudflare tetap muncul di komputer. SheetJS dipasang dari CDN resminya karena versi di registry npm sudah lama tidak diperbarui.

## Cara kerja

```
kode saham ─► /api/analyze ─► cache .cache/BBCA-2025.xlsx, -2023, -2021 (7 hari)
                                │ kosong
                                ▼
          Chrome (playwright-core, profil .cache/chrome-profile)
                                ▼
         tab IDX: lolos Cloudflare, lalu fetch di dalam tab
                                ▼
                       IDX GetFinancialReport (periode audit)
                                ▼
     unduh FinancialStatement-{2025,2023,2021}-Tahunan-BBCA.xlsx
       (tiap file berisi 2 tahun → 6 tahun data, tren 5 tahun)
                                ▼
                lib/parse.ts: cari baris berdasarkan label ID/EN
                                ▼
          lib/report.ts: ubah ke miliar Rp + harga terakhir (Yahoo)
                                ▼
        browser: lib/score.ts menilai, ulang setiap angka diubah
```

| File | Isi |
|---|---|
| `lib/idx.ts` | Membuka IDX lewat Chrome, mengambil daftar laporan, dan mengunduh file Excel |
| `lib/parse.ts` | Pola pencocokan baris laporan, satu tempat untuk disetel |
| `lib/report.ts` | Konversi satuan, jumlah saham dari EPS, DPS dari dividen dibayar |
| `lib/score.ts` | Mesin penilaian, fungsi murni tanpa dependensi |
| `lib/trend.ts` | Metrik dan geometri grafik tren (dipakai situs dan PDF) |
| `lib/pdf.ts`, `app/api/pdf` | Laporan PDF A4: HTML bertema situs dicetak oleh Chrome headless |
| `lib/price.ts` | Harga saham dan kurs USD/IDR |
| `lib/cache.ts` | Penyimpanan laporan: Vercel Blob kalau ada token, selain itu folder `.cache/` |
| `scripts/sync.ts` | `npm run sync`: tarik dari IDX di Mac, simpan ke Blob |
| `proxy.ts` | Kata sandi untuk versi online (`APP_PASSWORD`) |
| `app/api/debug` | Melihat isi baris Excel untuk menyetel pola |

## Online di Vercel (dibuka dari HP)

Versi online tidak bisa menarik data IDX sendiri, karena butuh Chrome asli dan verifikasi Cloudflare. Pembagiannya:

| Di mana | Tugas |
|---|---|
| Mac | `npm run sync BBCA TLKM` menarik laporan lewat Chrome lalu menyimpannya ke Vercel Blob |
| Vercel | Menampilkan nilai, tren, yield, dan PDF dari Blob; harga diambil langsung dari Yahoo |
| HP | Buka URL Vercel; saham baru di-sync dari Mac atau Excel-nya diunggah manual |

**Penyiapan sekali saja**

1. Push folder ini ke repo **private** di GitHub (`.cache/` dan `.env*` sudah diabaikan Git).
2. Di vercel.com: Add New → Project → impor repo tersebut → Deploy.
3. Di proyek Vercel: Storage → Create → Blob → pilih akses **Private** → hubungkan ke proyek. Vercel otomatis mengisi variabel Blob di server.
4. Settings → Environment Variables → tambahkan `APP_PASSWORD` (kata sandi untuk membuka aplikasi), lalu Redeploy.
5. Di Mac: buka store Blob → tab `.env.local` → salin `BLOB_READ_WRITE_TOKEN` ke file `.env.local` di folder ini.
6. `npm run sync BBCA TLKM` (tambahkan kode lain sesukanya). Buka URL Vercel di HP, masukkan kata sandi (nama pengguna bebas).

**Pemakaian rutin**

- Saham baru: `npm run sync KODE` di Mac, atau unggah Excel dari idx.co.id langsung di HP.
- Setelah laporan tahunan baru terbit (sekitar April): `npm run sync` tanpa kode memperbarui semua saham tersimpan.
- Selama `.env.local` berisi token, `npm run dev` di Mac juga membaca dan menyimpan ke Blob, jadi saham yang dicek di Mac ikut muncul di HP.

## Kalau ada masalah

**Jendela Chrome muncul.** Itu disengaja. IDX dilindungi Cloudflare yang memblokir `fetch` dari Node, jadi `lib/idx.ts` membuka Chrome asli dengan profil sendiri di `.cache/chrome-profile` dan melakukan semua permintaan dari dalam tab IDX. Kalau Cloudflare menampilkan "Just a moment...", selesaikan verifikasinya di jendela itu; aplikasi menunggu hingga 3 menit. Cookie Cloudflare tersimpan di profil, jadi biasanya hanya perlu sesekali. Chrome ditutup otomatis setelah 2 menit tidak dipakai. `IDX_HEADLESS=1 npm run dev` menyembunyikan jendela, tetapi verifikasi tidak bisa diselesaikan dalam mode itu.

**IDX tetap menolak.** Buka halaman Laporan Keuangan dan Tahunan di idx.co.id, unduh file `FinancialStatement-...xlsx` emiten tersebut, lalu pakai tombol unggah. File unggahan juga masuk cache.

**"Profil Chrome sedang dipakai".** Ada jendela Chrome cek-saham yang masih terbuka dari proses sebelumnya. Tutup jendela itu lalu coba lagi.

**Ada angka yang salah atau kosong.** Bandingkan dengan laporan aslinya, lalu buka `http://localhost:3000/api/debug?code=BBCA&q=ekuitas` untuk melihat baris yang tersedia. Sesuaikan pola di `RULES` dalam `lib/parse.ts`. Bagian "Sumber angka" di bawah hasil menunjukkan baris mana yang dipakai untuk setiap angka.

**Laporan baru sudah terbit tapi yang muncul masih lama.** Panggil `/api/analyze?code=BBCA&refresh=1`.

## Keterbatasan

- Tren memakai 3 file berselang dua tahun, jadi angka tahun ganjil di belakang (mis. 2022) berasal dari kolom tahun lalu di file berikutnya, sudah termasuk penyajian kembali kalau ada. Emiten yang baru IPO hanya punya tren sependek laporannya.
- Skala angka di file IDX kadang tidak sesuai label pembulatan (BBCA 2023 menyimpan rupiah penuh, EPS TLKM 2025 ikut dibagi). `lib/parse.ts` mengoreksinya lewat cek laba ÷ EPS.
- Laporan lama juga bisa diunggah manual satu per satu; file unggahan digabung dengan tahun lain yang sudah tersimpan.
- NPL dan CAR bank tidak ada di laporan utama, jadi diisi manual.
- Jumlah saham dihitung dari laba ÷ EPS dasar (rata-rata tertimbang), bukan jumlah beredar akhir tahun.
- DPS dihitung dari dividen kas yang dibayar di tahun itu (kolom entitas induk di laporan perubahan ekuitas, jadi dividen anak usaha ke pemegang saham minoritas tidak ikut), yang biasanya berasal dari laba tahun sebelumnya.
- Capex hanya pembayaran perolehan aset tetap, tanpa aset takberwujud, jadi bisa lebih kecil dari angka capex di siaran pers (TLKM 2025: 22,9 vs 27,5 triliun).
- Harga dari endpoint Yahoo Finance yang tidak resmi dan bisa berubah sewaktu-waktu.

Gunakan dengan wajar: cache sudah mencegah permintaan berulang, jadi jangan menghapusnya untuk mengambil banyak emiten sekaligus.
