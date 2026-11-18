# Environment Variables

## Tujuan

Mencatat variabel yang dibaca oleh frontend dan notebook; tidak ada nilai rahasia pada dokumen.

## Frontend Vite

| Variabel | Wajib untuk | Sumber | Contoh aman |
|---|---|---|---|
| `VITE_API_URL` | API chatbot. | Vite `.env`; URL ngrok sesi aktif. | `https://<url-ngrok-aktif>` |
| `VITE_API_KEY` | `POST /chat`. | Vite `.env`; harus cocok dengan Kaggle Secret `CHAT_API_KEY`. | `<isi-lokal-jangan-commit>` |

Prefix `VITE_` membuat nilai dapat diakses kode client dan diekspos ke bundle. Mengabaikan `.env` dari Git mencegah commit tidak sengaja, tetapi **tidak** menyembunyikan API key dari pengguna situs. Jangan gunakan secret berhak istimewa dalam build publik.

`src/lib/chatConfig.ts` membaca dua nilai ini. Vite membaca ulang setelah restart dev server/build.

## Notebook Kaggle

| Secret / setting | Penggunaan |
|---|---|
| `NGROK_AUTHTOKEN` | Token autentikasi pyngrok untuk membuat tunnel. |
| `CHAT_API_KEY` | Header autentikasi endpoint `/chat`. |
| `DEPLOY_DEFAULT_STAGE` | Konfigurasi notebook; source menyetel `sft`. |
| `API_PORT` | Port lokal terpilih oleh fungsi notebook. |
| `FRONTEND_ORIGINS` | CORS origins yang diizinkan notebook; termasuk Pages dan localhost port 3000/5173. |

Tiga variabel terakhir adalah konfigurasi/runtime notebook, bukan env vars yang dibaca bundle Vite. Nilai rahasia diatur pada Kaggle Secrets.

## Template

Gunakan [.env.example](../.env.example). File hanya memuat key nama variabel dengan nilai kosong; jangan menaruh key asli di dalamnya.

## Google Drive backend (server only)

| Variabel | Wajib | Penggunaan |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Untuk Drive API | Email service account. |
| `GOOGLE_PRIVATE_KEY` | Untuk Drive API | Private key service account; simpan hanya di env hosting. Bila perlu, newline dapat di-escape sebagai `\n`. |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Opsional | Root folder; default `1pTfZiAc0-H3Te3NvZsL5wUmb_fUaCf_B`. |
| `DRIVE_ADMIN_TOKEN` | Operasi Admin | Rahasia bearer token untuk upload/update/delete, daftar jawaban, dan download jawaban. |
| `DRIVE_TEACHER_UPLOAD_ENABLED` | Opsional | Set `true` hanya bila mengaktifkan upload jawaban Guru. Default nonaktif. |
| `DRIVE_TEACHER_UPLOAD_TOKEN` | Jika upload Guru diaktifkan | Token upload bersama; bukan identitas per-Guru. |

`GOOGLE_SERVICE_ACCOUNT_JSON` dan `GOOGLE_DRIVE_FOLDER_ID` tetap didukung sebagai nama lama, tetapi pilihan di atas adalah konfigurasi utama. Atur di Vercel Project Settings → Environment Variables, bukan di variabel `VITE_*`.

## Dokumen Terkait

- [Installation](./INSTALLATION.md)
- [API](./API.md)
- [Auth](./AUTH.md)
- [Security](./SECURITY.md)

**Diperbarui:** 2026-10-27 · **Versi dokumen:** 1.0.0
