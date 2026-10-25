# KSB GO — source terintegrasi + sinkronisasi Google Apps Script

**Status:** perbaikan source dan automation tersedia; **belum** ada bukti end-to-end transaksi/hosted production telah lulus. Jangan menafsirkan tes statis sebagai jaminan nol bug.

## Isi
- `src/`: file Apps Script `.gs`, `.html` dan `appsscript.json` (satu project lengkap, **bukan** patch).
- `tests/`: pemeriksaan sintaks, include allowlist, tombol/form, Kurir, stylesheet, dan penjaga backend.
- `.github/workflows/ci.yml`: pemeriksaan otomatis saat push/PR.
- `.github/workflows/deploy.yml`: satu kali klik melalui GitHub Actions untuk sinkronisasi semua file, backup remote lebih dahulu. **Tidak** menerbitkan `/exec` tanpa mencentang publish.
- `PANDUAN_DEPLOY_OTOMATIS.md`: langkah pemasangan dan konfigurasi GitHub yang diperlukan.

## Tes tanpa internet
`npm test` (Node 20+).

**Tidak ada Script ID, nomor rekening, API secret, OTP pepper, atau token Google di dalam ZIP.** Pengaturan App Script disimpan di akun Google/GitHub Secrets, bukan di repo.
