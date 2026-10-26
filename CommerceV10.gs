/** KSB GO V10 - transaction workflows with fail-closed safety gates. */
function ksbV10Mode_(){
  var value=String(ksbProperty_('COMMERCE_V10_MODE','CATALOG')).toUpperCase();
  return ['CATALOG','INTERNAL_UAT','LIVE_APPROVED'].indexOf(value)>=0?value:'CATALOG';
}
function ksbV10IsConfigured_(){
  var mode=ksbV10Mode_();
  if(mode==='CATALOG')return false;
  if(ksbProperty_('KSB_V7_MANUAL_CLAIMS','0')!=='1' || ksbProperty_('KSB_V7_TRANSFER_ENABLED','0')!=='1'||ksbProperty_('GATEWAY_MODE','DISABLED')!=='DISABLED')return false;
  if(!ksbProperty_('ADMIN_EMAIL')||!ksbProperty_('SPREADSHEET_ID')||!ksbProperty_('DRIVE_FOLDER_ID'))return false;
  if(mode==='INTERNAL_UAT')return ksbProperty_('V10_UAT_TEST_DATA_ONLY','0')==='1';
  // Flags are operator attestations, not proofs of regulatory compliance or banking approval.
  var approvals=['V10_BANK_BUSINESS_VERIFIED','V10_FUNDS_FLOW_LEGAL_REVIEW','V10_PUBLIC_SECURITY_AUDIT','V10_REFUND_PROCESS_APPROVED','V10_REAL_TRANSACTION_E2E_TESTS'];
  return approvals.every(function(k){return ksbProperty_(k,'0')==='1';})&&
    ksbProperty_('AUTH_ALLOW_PUBLIC_SIGNUP','0')==='1'&&
    ['BANK_NAME','BANK_NUMBER','BANK_HOLDER'].every(function(k){return !!ksbProperty_(k);});
}
function ksbV10Enabled_(){return ksbV10IsConfigured_();}
function ksbV10RequireCommerce_(){ksbRequire_(ksbV10Enabled_(),'Transaksi sedang dinonaktifkan oleh pengelola.');}
function ksbV10BuyerBank_(){
  if(ksbV10Mode_()==='INTERNAL_UAT')return {name:'SIMULASI - JANGAN TRANSFER',number:'0000000000',holder:'KSB GO DATA UJI'};
  if(!ksbV10Enabled_())return {name:'',number:'',holder:''};
  return {name:ksbProperty_('BANK_NAME'),number:ksbProperty_('BANK_NUMBER'),holder:ksbProperty_('BANK_HOLDER')};
}
function ksbV10ValidateBankReference_(ref){
  if(ksbV10Mode_()==='INTERNAL_UAT')ksbRequire_(/^UAT-[A-Za-z0-9-]{8,80}$/.test(String(ref)),'Mode UAT: gunakan referensi UAT-xxxxxxxx, bukan mutasi bank nyata.');
  else ksbRequire_(ksbV10Mode_()==='LIVE_APPROVED' && ksbV10Enabled_(),'Pencatatan bank LIVE belum diaktifkan.');
}
function ksbV10RouteAllowed_(action){
  var catalog=['config','catalog','market.store','market.reviews','product.detail',
    'auth.login','auth.otp.start','auth.otp.verify','auth.me','auth.logout','auth.roles','auth.profile','auth.apply',
    'seller.store','seller.store.save','seller.product.save','seller.product.list','seller.product.photos','seller.product.photo.remove','seller.dashboard',
    'admin.dashboard','admin.users','admin.pending','admin.approve','admin.settings','files.upload','files.read','courier.profile'];
  if(catalog.indexOf(action)>=0)return true;
  if(action==='admin.preflight.v15'||action==='admin.integrity.v15'||action==='admin.refund.cases'||action==='admin.refund.stock'||action==='refund.mine')return true;
  if(action==='refund.request'||action==='admin.refund.review'||action==='admin.refund.confirm'||action==='admin.refund.restock')return ksbV10Enabled_();
  if(!ksbV10Enabled_())return false;
  // Disabled independently of the stage. No unverified payment gateway or COD flows in this release.
  var denied=['payment.gateway.start','payment.gateway.check','delivery.create',
    'admin.gateway.settlement.confirm','admin.gateway.status','admin.gateway.payout.queue','admin.gateway.payout.list',
    'admin.settlement','admin.invoice.issue','admin.invoice.pay','admin.invoices',
    'admin.disputes'];
  return denied.indexOf(action)<0;
}
