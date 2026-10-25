/** KSB GO V6: read-only launch diagnostics. Private: NEVER publish as a client-callable function. */
function launchAudit_(){
  var out={release:'V6 SECURITY CANDIDATE',checkedAt:new Date().toISOString(),
    publicLaunchReady:false,checks:[],externalBlockers:[]};
  function check_(name,ok,details,severity){out.checks.push({name:name,ok:!!ok,severity:severity||'BLOCKER',details:details||''});}
  var admin=ksbProperty_('ADMIN_EMAIL');
  check_('Email administrator',/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin),'Isi ADMIN_EMAIL.');
  check_('Pendaftaran tertutup',ksbProperty_('AUTH_ALLOW_PUBLIC_SIGNUP','0')==='0','Untuk uji staging, wajib 0.');
  check_('Email penguji',!!ksbProperty_('AUTH_ALLOWED_EMAILS'),'Minimal email tester terdaftar.');
  check_('OTP pepper',ksbProperty_('AUTH_OTP_PEPPER').length>=24,'Jalankan instalasi/migrasi login V5.');
  check_('Barang wajib prabayar',ksbSettingNumber_('marketplace_prepaid_only',0)===1,'Mencegah kurir membayar harga barang.');
  check_('Mode pembayaran aman',['DISABLED','TEST'].indexOf(ksbProperty_('GATEWAY_MODE','DISABLED'))>=0,'Paket ini tidak menerima konfigurasi LIVE.');
  check_('Payout nyata tidak aktif',!ksbProperty_('XENDIT_LIVE_API_KEY'),'Jangan simpan production credential dalam proyek staging.');
  check_('Rekening operator',!!(ksbProperty_('BANK_NAME')&&ksbProperty_('BANK_HOLDER')&&ksbProperty_('BANK_NUMBER')),'Hanya jika memakai transfer manual staging.','WARNING');
  check_('Google Maps',!!ksbProperty_('MAPS_API_KEY'),'Isi key Maps yang dibatasi referrer; tarif zona dapat dipakai tanpa rute dinamis.','WARNING');
  try{
    var book=ksbBook_(),names=Object.keys(KSB_SCHEMA),wrong=[];
    names.forEach(function(n){var s=book.getSheetByName(n);if(!s||s.getLastColumn()!==KSB_SCHEMA[n].split(',').length)wrong.push(n);});
    check_('Database & header',wrong.length===0,wrong.length?wrong.join(', '):names.length+' sheet sesuai skema.');
  }catch(e){check_('Database & header',false,String(e.message));}
  try{var f=ksbAssetFolder_();check_('Drive aset',!!f.getId(),'Folder tersedia.');}catch(e){check_('Drive aset',false,String(e.message));}
  if(ksbProperty_('GATEWAY_MODE','DISABLED')==='TEST'){
    check_('Gateway TEST',/^xnd_development_/.test(ksbProperty_('XENDIT_TEST_API_KEY')),'Harus development API key.');
    check_('Webhook relay secret',ksbProperty_('WEBHOOK_RELAY_SECRET').length>=32,'Relay Cloud Run perlu konfigurasi identik.','WARNING');
  }
  out.externalBlockers=[
    'Migrasi transaksi Google Sheets multi-tabel ke backend transaksional dengan outbox/recovery, atau pembatasan pilot setelah uji pemulihan kerusakan data.',
    'Gateway dan payout uang nyata: persetujuan penyedia, KYC mitra, uji webhook, refund dan reversal end-to-end.',
    'Uji penetrasi, pembatasan abuse/rate limit server, log tanpa data sensitif, dan kebijakan privasi.',
    'Uji nyata Google Apps Script/Maps/Drive, transaksi multi-seller, kurir paralel, COD, transfer, laporan dan semua ukuran layar.',
    'Persetujuan ketentuan usaha, pajak, perlindungan konsumen, keamanan data, SOP retur/sengketa dan layanan pelanggan.'
  ];
  out.stagingChecksPassed=out.checks.filter(function(x){return x.severity==='BLOCKER';}).every(function(x){return x.ok;});
  out.status=out.stagingChecksPassed?'STAGING_CAN_BE_TESTED':'STAGING_BLOCKED';
  return out;
}
/** Run from project editor; never accessible through google.script.run. */
function runPreflight_(){var r=launchAudit_();Logger.log(JSON.stringify(r,null,2));return r;}
