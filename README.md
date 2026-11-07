# Ruang Hadir

Aplikasi absensi karyawan, pinjaman, pembayaran, dan arsip laporan pembukuan.

## Menjalankan di komputer

Persyaratan: Node.js 20.19 atau lebih baru dan pnpm.

```powershell
pnpm install
pnpm dev
```

Vite akan menampilkan alamat lokal (biasanya `http://localhost:5173`). Tanpa konfigurasi Supabase, aplikasi berjalan dalam **mode lokal** dan menyimpan data hanya di browser/perangkat tersebut.

Untuk memeriksa paket produksi:

```powershell
pnpm build
pnpm preview
```

## Menyiapkan database Supabase

1. Buat proyek di Supabase.
2. Buka **SQL Editor**, lalu jalankan seluruh isi [`supabase/schema.sql`](./supabase/schema.sql).
3. Di **Authentication → Users**, buat/invite akun Owner. Matikan pendaftaran publik (sign-up).
4. Salin User UID akun Owner, lalu daftarkan sebagai admin dengan menjalankan perintah berikut di SQL Editor (ganti placeholder):

   ```sql
   insert into public.app_admins (user_id)
   values ('<OWNER_AUTH_USER_UID>');
   ```

5. Salin URL proyek dan **anon/publishable key** dari Project Settings → API.
6. Salin [`.env.example`](./.env.example) menjadi `.env.local`, lalu isi nilainya:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
   ```

7. Jalankan ulang `pnpm dev`. Masuk dengan email/kata sandi akun Owner. Data absensi, karyawan, dan pinjaman kemudian tersimpan bersama di database; laporan pembukuan disimpan sebagai snapshot terpisah.

Jangan pernah memasukkan `service_role` key, kata sandi database, atau secret Supabase ke berkas `VITE_*` maupun kode frontend. Key frontend yang dipakai aplikasi adalah anon/publishable key; akses database dibatasi oleh Row Level Security dan allowlist `app_admins` pada skema.

## Hosting di Vercel

1. Dorong folder proyek ke repository Git.
2. Impor repository di Vercel. Konfigurasi build Vite disediakan oleh [`vercel.json`](./vercel.json); perintah build adalah `pnpm build`.
3. Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` pada Project Settings → Environment Variables di Vercel (Production dan Preview bila digunakan).
4. Deploy. Setiap kali mengubah environment variable, jalankan deployment baru.
5. Tambahkan domain Vercel pada Supabase Authentication → URL Configuration (Site URL dan Redirect URLs).

Selama secret Supabase belum diisi, aplikasi tetap dapat dicoba secara lokal, tetapi data tidak tersinkron dan laporan hanya tersimpan di browser. Koneksi Supabase yang aktif memerlukan skema SQL dan akun Owner terlebih dahulu.
