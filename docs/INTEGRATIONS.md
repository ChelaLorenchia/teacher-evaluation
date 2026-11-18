# Integrations

## Tujuan

Mencatat komunikasi eksternal dan pertukaran file website.

## FastAPI notebook dan ngrok

- Backend: `dpo-guru.ipynb`, Langkah 22, FastAPI/Uvicorn dan tunnel pyngrok.
- Kaggle Secrets: `NGROK_AUTHTOKEN`, `CHAT_API_KEY`.
- Frontend chat memakai `VITE_API_URL`, `VITE_API_KEY`, `GET /health`, dan `POST /chat`.
- URL ngrok berubah per sesi; perbarui konfigurasi saat URL berganti.
- Tidak ada fallback jawaban lokal; error API ditampilkan apa adanya melalui pesan yang ramah.

## File lokal

| Format | Alur |
|---|---|
| XLSX | Input sheet `Feedback`, sheet `Rubrik` opsional, serta sheet `Skor` opsional; output `Feedback` + `Rubrik` dan `Skor` bila ada skor. |
| CSV | Input template anotasi `Feedback`; rubrik memakai default karena CSV tidak memiliki sheet. |
| JSON | Paket evaluasi masuk; backup/pemulihan kedua mode. |
| XLSX | Output evaluasi blind untuk dibaca ulang di Kaggle. |

## Google Drive

Integrasi backend menggunakan Vercel Serverless Functions pada folder `api/`.

- Root folder resmi: `TEACHER EVALUATION`
- Root folder ID default: `1pTfZiAc0-H3Te3NvZsL5wUmb_fUaCf_B`
- Struktur minggu: `WEEK 1` sampai `WEEK 4`
- Subfolder soal: `01_SOAL_EVALUASI`
- Subfolder jawaban: `02_JAWABAN_GURU`
- Backend mencari folder terlebih dahulu dan hanya membuat folder bila belum ada.
- Identitas dokumen menggunakan Google Drive file ID.
- Upload menolak nama duplikat; Admin memperbarui dokumen dengan memilih file yang ada sehingga file ID dipertahankan.
- Delete backend memindahkan file ke sampah Google Drive; UI meminta konfirmasi.
- Database/localStorage harus dianggap sumber utama jawaban; kegagalan Google Drive tidak boleh menghapus hasil lokal.

API:

| Route | Operasi | Hak akses |
|---|---|---|
| `GET /api/health-drive` | Melaporkan status API (`status: online`) serta koneksi Drive terpisah pada `drive.connected` | Public status only; tidak mengembalikan credential. |
| `GET /api/list-drive?week=WEEK%201&documentKind=question` | Daftar instrumen | Guru/Public. |
| `GET /api/list-drive?week=WEEK%201&documentKind=answer` | Daftar jawaban Guru | Admin token. |
| `GET /api/download-drive?...` | Download file lewat backend | Instrumen Guru/Public; jawaban Admin token. |
| `POST /api/upload-drive` | Upload atau update XLSX | Instrumen Admin; jawaban token Guru hanya jika diaktifkan. |
| `DELETE /api/delete-drive?...` | Pindahkan file ke Trash | Admin token. |

Konfigurasi dan deployment:

1. Deploy repository ke Vercel. `vercel.json` menetapkan Vite build dan folder output `dist`; route `api/*.ts` menjadi serverless functions.
2. Buat service account Google Cloud dan aktifkan Google Drive API.
3. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, dan `GOOGLE_DRIVE_ROOT_FOLDER_ID` pada Vercel.
4. Bagikan root folder yang sudah ada kepada service account sebagai Editor; jangan buat root folder lain.
5. Set rahasia acak kuat untuk `DRIVE_ADMIN_TOKEN`.
6. Jangan set `DRIVE_TEACHER_UPLOAD_ENABLED=true` sampai ada proses identitas Guru yang memadai. Token upload bersama bukan pengganti autentikasi per pengguna.
7. Jangan menaruh credential atau private key pada variabel `VITE_*` atau source frontend.

Health check `/api/health-drive` selalu membedakan API yang hidup dari koneksi Google Drive. `drive.connected: true` hanya dikembalikan setelah service account berhasil membaca metadata folder root. Belum ada cara untuk menyatakan akses benar sebelum endpoint dijalankan pada deployment dengan secret dan permission tersebut.

Admin routes dilindungi `DRIVE_ADMIN_TOKEN` dan token hanya ditahan sementara di halaman Admin. Ini merupakan kontrol berbasis shared secret, bukan akun, identitas, atau audit per-admin; ganti dengan autentikasi per pengguna sebelum penggunaan multi-admin/produksi. Jawaban guru tidak dapat diakses melalui endpoint question-bank publik. Upload jawaban Guru dinonaktifkan kecuali `DRIVE_TEACHER_UPLOAD_ENABLED=true` dan token upload disetel; token bersama tidak memberi isolasi identitas per Guru.

`netlify.toml` sekarang mengarahkan `/api/*` ke Netlify Functions pada `netlify/functions/`; `vercel.json` mendukung deployment Vercel dengan endpoint pada `api/`. GitHub Pages tetap static-only dan tidak dapat menjalankan backend ini.

## Browser dan deployment

- `localStorage`: penyimpanan per browser/origin.
- File API, Blob, dan Object URL: baca/unduh file lokal.
- `fetch`: hanya untuk chatbot.
- GitHub Actions membangun dan mendeploy static site ke GitHub Pages.

## Dokumen Terkait

- [API](./API.md)
- [ENV](./ENV.md)
- [Deployment](./DEPLOYMENT.md)
- [Backup/recovery](./BACKUP_RECOVERY.md)

**Diperbarui:** 2026-10-27 · **Versi dokumen:** 1.3.0
