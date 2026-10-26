/** Read-only installation self-check for V17. Does not change production settings or data. */
function verifyKsbReleaseV17(){
  var props=PropertiesService.getScriptProperties();
  var templates=['Index','App','AuthUIV5','Courier','PortalV8','Seller','Buyer','AdminView','Scripts'];
  var found={};
  templates.forEach(function(n){
    try {var txt=HtmlService.createHtmlOutputFromFile(n).getContent();found[n]=txt.length>80?'OK':'EMPTY';}
    catch(e){found[n]='MISSING';}
  });
  var ok=templates.every(function(n){return found[n]==='OK';});
  var keys=['ADMIN_EMAIL','SPREADSHEET_ID','DRIVE_FOLDER_ID','BANK_NAME','BANK_NUMBER','BANK_HOLDER',
    'COMMERCE_V10_MODE','AUTH_ALLOW_PUBLIC_SIGNUP','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY'];
  var configured={};
  keys.forEach(function(k){configured[k]=Boolean(props.getProperty(k));});
  var commerceMode=props.getProperty('COMMERCE_V10_MODE')||'CATALOG';
  var result={build:'17.0',templateStatus:found,templatesOK:ok,configured:configured,
    commerceMode:commerceMode,otpResendSeconds:Number(props.getProperty('AUTH_OTP_RESEND_SECONDS')||30),
    note:'Hanya pemeriksaan file dan konfigurasi, bukan pengujian bank atau izin usaha.'};
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
