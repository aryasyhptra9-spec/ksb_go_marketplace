# Audit KSB GO V17.2 — Status terukur dan batasan

## Sumber
Source lengkap V17.0 yang tersedia di percakapan, ditambah hotfix mobile V17.1. Source yang mungkin telah Anda edit langsung pada Google Apps Script **setelah** versi itu belum diambil dari server dan tidak tercakup; jangan menimpa sebelum backup dan diff.

## Perbaikan dalam paket ini
1. `Index.html`: `Courier` dimuat sebelum `AuthUIV5`, menghindari wrapper yang menangkap fallback “Modul Kurir belum tersedia”. Tidak memakai template sementara `CourierRuntimeV166` yang tidak ada dalam daftar izin.
2. `Styles.html`, `PortalV8.html`, `Index.html`: menggabungkan hotfix mobile V17.1 agar CSS portal berada di `head`; tombol pilihan role dibuat satu kolom pada HP.
3. Versi build UI/backend diseragamkan ke V17.2.
4. Integrasi GitHub Actions + clasp: lint sebelum push, backup remote, pembaruan draft, opsi deployment yang memerlukan tindakan eksplisit dan environment approval.
5. Tes otomatis: pemeriksaan sintaks seluruh Apps Script dan script HTML; pemeriksaan whitelist include; pemeriksaan keberadaan handler tombol/form statis; simulasi tampilan order Kurir melalui wrapper autentikasi; pemeriksaan pengaman checkout/transaksi.

## Diuji di lingkungan lokal
`node --test tests/source.test.cjs` — 9 kelompok pengujian lulus. Ini adalah pengujian sintaks/struktur dan simulasi UI terbatas, **bukan** uji seluruh tombol pada browser nyata atau uji integrasi Apps Script/Google API.

## Belum terverifikasi / perlu tindakan
- Cloudflare Turnstile pada hostname iframe HTML Service dapat berubah; login publik semua perangkat belum terbukti. Jika hostname berbeda, Turnstile bisa gagal. Solusi permanen perlu identitas origin yang stabil dan adaptasi auth, bukan memperluas whitelist ke seluruh googleusercontent.com.
- Proses checkout nyata, Google Routes API, Gmail OTP, mutasi bank, pencairan Seller/Kurir dan jalur refund harus diuji di deployment staging dan dicocokkan dengan transaksi di bank resmi.
- Photo-only payment admin bukan bank API reconciliation; tetap perlu bukti uang masuk secara independen dan pencocokan settlement sesudahnya.
- **Tiga metode penerimaan barang (Kurir/Seller/Ambil Sendiri) belum tersambung end-to-end di backend.** `ksbFinalizeDelivery_` saat ini mewajibkan record Kurir; sehingga mengaktifkan dropdown Seller/Pickup tanpa ledger terpisah berisiko salah saldo. Jangan memasarkan fitur ini sebagai aktif sebelum migrasi, pengujian, dan audit akuntansi tersendiri.
- Pencarian handler dilakukan atas data-action dan form yang statis, tidak menjamin setiap interaksi runtime bebas error.
- Otomasi dapat menimpa source online, termasuk file terbaru yang tidak berada dalam ZIP ini. Wajib backup dan diff sebelum produksi pertama.
- Rotasi `TURNSTILE_SECRET_KEY` dan `AUTH_OTP_PEPPER` yang sebelumnya sempat terekspos. Password/token tidak disimpan di ZIP ini.

## Gate produksi minimum
- Semua URL `buyer`,`seller`,`courier`,`admin` dan login dari HP berbeda lulus.
- Seller READY berubah menjadi delivery AVAILABLE, kurir klaim hanya sekali, lalu pickup-delivered-confirm buyer receipt; saldo dan tagihan satu kali.
- Checkout harga/ongkir/stok dihitung ulang server dan pembayaran masuk diverifikasi dari bank resmi.
- Invoice, komisi, voucher, refund, rekonsiliasi, payout tidak double count.
- Tidak ada CSS / teks `.gs` bocor ke halaman.
- GitHub Actions staging lulus, remote source backup tersimpan, dan production GitHub Environment menggunakan persetujuan.

**Pernyataan kesiapan:** kandidat integrasi + pipeline, belum disertifikasi bebas error atau layak menerima pembayaran publik sampai UAT live lulus.
