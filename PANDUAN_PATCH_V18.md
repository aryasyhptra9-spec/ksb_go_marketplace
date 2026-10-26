# KSB GO — pembaruan V18

## Pemasangan

1. Cadangkan Google Spreadsheet, Google Apps Script, dan deployment sebelumnya.
2. Unggah seluruh isi folder `src/` menggunakan `clasp push` yang sudah terautentikasi, bukan ZIP langsung di editor Apps Script.
3. Jalankan `installProject_()` sekali dari editor Apps Script dengan akun pemilik untuk mengisi properti rekening jika belum ada. Jika sebelumnya sudah ada rekening lain, cek dan ubah manual di Script Properties.
4. Periksa Script Properties `BANK_NAME=BCA`, `BANK_NUMBER=0561934877`, `BANK_HOLDER=Arya Syah Putra`. Pastikan rekening benar-benar milik operator yang berwenang.
5. Jalankan pemeriksaan konfigurasi, pengujian pesanan/pembayaran/seller/kurir/admin pada lingkungan aman sebelum memperbarui deployment publik.

## Perubahan

- Tombol **Beli Sekarang** dan checkout yang sudah ada dipertahankan; pengujian statis memastikan handler terpasang.
- Rekening BCA ditambahkan sebagai nilai awal Script Properties tanpa menimpa nilai yang sudah diatur.
- Notifikasi **di dalam aplikasi** ditambahkan untuk seller saat checkout, kurir online terverifikasi saat barang siap diklaim, dan admin saat tagihan mitra dibuat.
- Tautan WhatsApp manual yang sudah ada tetap tersedia. **Pesan WhatsApp tidak terkirim otomatis** tanpa WhatsApp Business Platform/provider resmi, nomor terverifikasi, izin penerima, template yang disetujui, dan mekanisme retry.
- Transaksi LIVE tetap dilindungi konfigurasi launch gate dan verifikasi mutasi bank. Jangan menonaktifkan pengaman tersebut.

## Batas pengujian

`npm test` menguji source secara lokal. Hasilnya bukan bukti bahwa API Google, transaksi sungguhan, WhatsApp, maupun deployment produksi sudah lulus pengujian end-to-end.
