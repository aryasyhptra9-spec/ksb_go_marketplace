# KSB GO — Sekali sinkron, bukan salin puluhan file

## A. Penting sebelum mulai
1. **Backup** project Apps Script, Spreadsheet, dan Drive. Jika ada perubahan kode terbaru di editor Apps Script yang tidak ada dalam source V17.0 sebelumnya, **ambil `clasp pull` ke GitHub dahulu dan review perbedaannya**; `clasp push` akan mengganti SELURUH source project online.
2. Gunakan **project staging Apps Script terpisah** dengan spreadsheet dan folder Drive uji. Jangan memakai database transaksi aktif untuk staging.
3. Pastikan Google Apps Script API diaktifkan: https://script.google.com/home/usersettings
4. Kode ini tidak memuat Script Properties atau kredensial. `installProject_()` tidak perlu dijalankan ulang pada DB produksi.
5. Secret Cloudflare dan OTP pepper yang pernah tampak di screenshot perlu dirotasi sebelum rilis nyata. Rotasi pepper dapat membatalkan OTP lama.

## B. Siapkan GitHub (cukup sekali)
1. Buat repositori GitHub privat milik Anda. Upload **isi ZIP ini** ke root repo (folder `src`, `.github`, `tests`, dan file pendukung). GitHub perlu mempertahankan folder `.github` (tersembunyi di sebagian file manager).
2. Pada komputer dengan Node 20+ jalankan `npm install -g @google/clasp@3` dan `clasp login`; berikan izin hanya pada akun Google pemilik Apps Script.
3. File lokal `~/.clasprc.json` menyimpan **refresh token OAuth**; jangan diupload, dipotret, atau dikirim melalui chat.
4. Di GitHub → Settings → Environments, buat **staging** dan **production**. Untuk production aktifkan **Required reviewers** bila tersedia pada plan GitHub Anda.
5. Di EACH Environment → **Secrets**, isi:
   - `CLASPRC_JSON`: isi file `~/.clasprc.json` (dari akun yang berhak mengelola Apps Script).
   - `CLASP_JSON`: JSON dengan `scriptId` Apps Script milik environment tersebut, contohnya `{"scriptId":"SCRIPT_ID_MILIK_ANDA","rootDir":"src"}`. Jangan isi di dalam repo.
6. Di EACH Environment → **Variables**, isi:
   - `SCRIPT_ID`: Script ID yang sama persis dengan secret `CLASP_JSON`.
   - `DEPLOYMENT_ID`: ID deployment `/exec` yang sudah ada di project environment tersebut; **bukan** Script ID. Isi hanya jika ingin pembaruan `/exec` secara otomatis. Lihat Deploy → Manage deployments.
7. Simpan semua credentials di Secrets, bukan file publik. Jika hanya punya satu project saat ini, buat staging terpisah sebelum sinkronisasi pertama.

## C. Update otomatis dari GitHub
1. GitHub → **Actions** → **KSB GO - Sinkronisasi Otomatis Apps Script** → **Run workflow**.
2. Pilih `staging` terlebih dahulu. Isikan konfirmasi `SYNC KSB GO`. Kosongkan `publish_webapp` agar hanya draft code yang dikirim ke staging (preview `/dev` untuk editor).
3. Pipeline otomatis menjalankan tests, mem-backup source remote, lalu `clasp push --force` untuk **SEMUA file**. Jika backup atau tes gagal, kode online tidak ditimpa.
4. Buka tautan log Actions, pastikan tidak ada tanda merah. Unduh artifact backup sebelum retention habis.
5. Uji `/dev?portal=buyer`, `/dev?portal=seller`, `/dev?portal=courier`, `/dev?portal=admin`. Uji dari desktop dan HP, login OTP, checkout, bukti bayar, status seller READY → delivery AVAILABLE, klaim atomik kurir, konfirmasi penerimaan, invoice dan penagihan.
6. Setelah staging benar-benar lulus dan data keuangan dicek, pilih `production`, konfirmasi `SYNC KSB GO`, dan centang `publish_webapp`. Required reviewers akan menahan deployment sampai disetujui. `clasp create-deployment --deploymentId` memperbarui deployment `/exec` yang ada tanpa membuat URL baru.
7. Mulai saat itu **jangan edit kode langsung di Apps Script**; edit GitHub lalu jalankan workflow. Script Properties/data Google Sheets tidak ikut disalin oleh `clasp push`.

## D. Pemeriksaan wajib di HP sebelum rilis
- [ ] CSS tidak tampil sebagai teks di bawah halaman.
- [ ] Pilihan akun Pembeli/Seller/Kurir tidak saling tumpang tindih.
- [ ] Cloudflare Turnstile berfungsi pada hostname setiap browser (host iframe Apps Script dapat berubah).
- [ ] Kurir: `KSB_COURIER_MODULE_OK === true` dan tombol Ambil Order bekerja.
- [ ] Order Seller `READY` membuat `DELIVERY_ORDERS` status `AVAILABLE` (jangan edit Sheets langsung).
- [ ] Harga/ongkir divalidasi di server; jangan ada pesanan dengan ongkir kosong.
- [ ] Admin hanya konfirmasi setelah uang benar-benar terlihat di rekening, bukan berdasarkan foto saja.
- [ ] Tagihan Seller/Kurir dan invoice tidak dihitung dua kali; refund ditangani.
- [ ] Logout/login lintas peran serta izin akses non-Admin telah diuji.

## E. Fitur yang masih perlu pengembangan backend khusus
Pilihan **Antar Seller / Ambil Sendiri / Kurir KSB RUTE** belum aman untuk diaktifkan hanya dengan dropdown; perlu model pengiriman per seller, perhitungan komisi/pajak/ongkir, bukti serah terima, dan ledger berbeda. Paket ini **tidak mengklaim** fitur tersebut sudah siap produksi.

## F. Kalau sudah ada project GitHub dari percakapan sebelumnya
Repositori GitHub Anda dapat dipakai kembali, tidak perlu membuat repo baru. Sebelum mengganti seluruh source, cocokkan file pada repo dengan Apps Script aktif melalui `clasp pull` dan tinjau perbedaannya. Commit source yang dipilih ke branch baru agar rollback mudah.
