/** KSB GO + KSB RUTE. Settings are read from Script Properties, never from the browser. */
var KSB_CFG = {
  TZ: 'Asia/Makassar',
  CURRENCY: 'IDR',
  SESSION_DAYS: 7,
  SESSION_MAX_HOURS: 8,
  MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
  ORDER_STATES: ['PENDING_PAYMENT','CONFIRMED','PROCESSING','READY','IN_DELIVERY','PARTIALLY_DELIVERED','DELIVERED','CANCELLED','DISPUTED'],
  DELIVERY_STATES: ['WAITING_SELLER','AVAILABLE','CLAIMED','HEADING_TO_PICKUP','PICKED_UP','IN_DELIVERY','DELIVERED','FAILED_DELIVERY','RETURN_REQUESTED','RETURNED','DISPUTED','CANCELLED'],
  CLAIM_PENDING: ['CLAIMED','HEADING_TO_PICKUP']
};
function ksbProperty_(k, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  return v === null ? (fallback === undefined ? '' : fallback) : v;
}
function ksbPrivateConfig_() {
  return {
    spreadsheetId: ksbProperty_('SPREADSHEET_ID'), folderId: ksbProperty_('DRIVE_FOLDER_ID'),
    mapsKey: ksbProperty_('MAPS_API_KEY'), routesKey: ksbProperty_('ROUTES_API_KEY'),
    clientId: ksbProperty_('GOOGLE_CLIENT_ID'), bankName: ksbProperty_('BANK_NAME'),
    bankNumber: ksbProperty_('BANK_NUMBER'), bankHolder: ksbProperty_('BANK_HOLDER')
  };
}
function ksbPublicConfig_() {
  return {
    appName:'KSB GO', buildVersion:'V17.2', launchMode:ksbV10Mode_(), manualTransferOnly:ksbV10Enabled_(),checkoutEnabled:ksbV10Enabled_(), authMethod:'EMAIL_OTP', publicSignupEnabled:ksbPublicSignupEnabled_(), signupStatus:ksbPublicSignupEnabled_()?'PUBLIC_VERIFIED':(ksbProperty_('AUTH_ALLOW_PUBLIC_SIGNUP','0')==='1'?'TURNSTILE_CONFIGURATION_REQUIRED':'TEST_EMAIL_ALLOWLIST_ONLY'), turnstileSiteKey:ksbPublicSignupEnabled_()?ksbProperty_('TURNSTILE_SITE_KEY'):'', tagline:'Belanja, Kirim, Lebih Dekat',
    clientId:ksbProperty_('GOOGLE_CLIENT_ID'), mapsKey:ksbProperty_('MAPS_API_KEY'),
    bankName:ksbV10BuyerBank_().name, bankNumber:ksbV10BuyerBank_().number,
    bankHolder:ksbV10BuyerBank_().holder, qrisImage:ksbQrImageV11_(), tz:KSB_CFG.TZ,
    paymentRoute:'MANUAL_TRANSFER',marketplacePrepaidOnly:ksbSettingNumber_('marketplace_prepaid_only',1)===1,
    districts:ksbRows_('DISTRICTS').filter(function(r){return r.active==='TRUE';}).map(function(r){return {id:r.id,name:r.name};})
  };
}

/** Only public QRIS merchant image, issued to this business by an authorized provider. */
function ksbQrImageV11_(){
  if(!ksbV10Enabled_()||ksbProperty_('QRIS_ENABLED','0')!=='1')return '';
  var fileId=String(ksbProperty_('QRIS_PUBLIC_FILE_ID','')).trim();
  if(!/^[A-Za-z0-9_-]{15,100}$/.test(fileId))return '';
  return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(fileId)+'&sz=w900';
}
