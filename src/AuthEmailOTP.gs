/** KSB GO V5: passwordless email OTP, pilot/staging only. No browser-supplied role grants. */
/** Public registration is independent of commerce/checkout enablement. */
function ksbPublicSignupEnabled_(){
  return ksbProperty_('AUTH_ALLOW_PUBLIC_SIGNUP','0')==='1' &&
    !!ksbProperty_('TURNSTILE_SITE_KEY') && !!ksbProperty_('TURNSTILE_SECRET_KEY') &&
    !!String(ksbProperty_('TURNSTILE_ALLOWED_HOSTNAMES')||'').trim();
}
function ksbAuthAllowed_(email){
  var admin=String(ksbProperty_('ADMIN_EMAIL')||'').toLowerCase();
  var emails=String(ksbProperty_('AUTH_ALLOWED_EMAILS')||'').toLowerCase().split(',').map(function(x){return x.trim();});
  return email===admin || emails.indexOf(email)>=0 || ksbPublicSignupEnabled_();
}
/** Validate a one-time CAPTCHA token SERVER SIDE. Never trust a browser-only success. */
function ksbVerifyPublicCaptcha_(token){
  ksbRequire_(ksbPublicSignupEnabled_(),'Pendaftaran publik belum dikonfigurasi dengan aman.');
  token=String(token||'');
  ksbRequire_(token.length>=20 && token.length<=2048,'Selesaikan verifikasi anti-bot.');
  var response;
  try{
    response=UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'post',
      contentType:'application/x-www-form-urlencoded',
      payload:{secret:ksbProperty_('TURNSTILE_SECRET_KEY'),response:token},
      muteHttpExceptions:true
    });
  }catch(e){throw new Error('Layanan anti-bot tidak dapat dihubungi. Coba lagi.');}
  ksbRequire_(response.getResponseCode()===200,'Verifikasi anti-bot gagal. Coba lagi.');
  var verified;
  try{verified=JSON.parse(response.getContentText());}catch(e){throw new Error('Jawaban layanan anti-bot tidak valid.');}
  ksbRequire_(verified.success===true && verified.action==='ksb_public_auth','Verifikasi anti-bot tidak sah atau kedaluwarsa.');
  var hostnames=String(ksbProperty_('TURNSTILE_ALLOWED_HOSTNAMES')||'').toLowerCase().split(',').map(function(x){return x.trim();}).filter(Boolean);
  ksbRequire_(hostnames.length>0,'Hostname anti-bot belum dikonfigurasi.');
  ksbRequire_(hostnames.indexOf(String(verified.hostname||'').toLowerCase())>=0,'Asal situs verifikasi tidak sesuai.');
  return true;
}

function ksbOtpDigest_(challengeId,email,code){
  var pepper=ksbProperty_('AUTH_OTP_PEPPER');
  ksbRequire_(pepper&&pepper.length>=24,'Jalankan migrateRoleAuthV5_() dulu.');
  return ksbSha_(pepper+':'+challengeId+':'+email+':'+code);
}
function ksbOtpStart_(args){
  var email=ksbEmail_(args.email),role=ksbString_(args.role||'BUYER',20).toUpperCase();
  ksbRequire_(['BUYER','SELLER','COURIER','ADMIN'].indexOf(role)>=0,'Peran tidak dikenal.');
  ksbRequire_(ksbAuthAllowed_(email),'Email belum diizinkan.');
  // Public users must pass a one-time captcha before consuming a MailApp quota.
  if(role!=='ADMIN' && ksbProperty_('AUTH_ALLOW_PUBLIC_SIGNUP','0')==='1'){
    ksbVerifyPublicCaptcha_(args.turnstileToken);
  }
  if(role==='ADMIN')ksbRequire_(email===String(ksbProperty_('ADMIN_EMAIL')||'').toLowerCase(),'Email ini tidak ditetapkan sebagai admin.');
  ksbRequire_(MailApp.getRemainingDailyQuota()>0,'Kuota email harian habis. Silakan coba lagi besok.');
  var code='',cid='',now=Date.now();
  ksbWithLock_(function(){
    var items=ksbRows_('AUTH_CHALLENGES'),recent=items.filter(function(r){return now-new Date(r.created_at).getTime()<3600000;});
    ksbRequire_(recent.length<60,'Terlalu banyak permintaan kode. Coba lagi nanti.');
    var own=recent.filter(function(r){return r.email===email;});
    ksbRequire_(own.length<4,'Batas pengiriman kode untuk email ini tercapai.');
    // A configurable resend cooldown with a safe minimum. The 4 codes/hour and
    // global 60 codes/hour protections remain unchanged.
    var configuredResend=Number(ksbProperty_('AUTH_OTP_RESEND_SECONDS','30'));
    var resendSeconds=Number.isFinite(configuredResend)?Math.min(300,Math.max(30,Math.floor(configuredResend))):30;
    ksbRequire_(!own.some(function(r){return now-new Date(r.created_at).getTime()<resendSeconds*1000;}),
      'Tunggu '+resendSeconds+' detik sebelum mengirim kode lagi.');
    // Use UUID entropy; avoid Math.random for verification codes.
    code=String(parseInt(Utilities.getUuid().replace(/-/g,'').slice(0,12),16)%100000000).padStart(8,'0');
    cid=ksbId_('OTP');
    ksbAppend_('AUTH_CHALLENGES',{id:cid,email:email,role:role,code_hash:ksbOtpDigest_(cid,email,code),expires_at:String(now+20*60000),attempts:'0',used:'FALSE',created_at:new Date(now).toISOString()});
  });
  try{MailApp.sendEmail({to:email,subject:'Kode masuk KSB GO (berlaku 20 menit)',body:'Kode verifikasi KSB GO Anda: '+code+'\nBerlaku 20 menit, maksimal 5 percobaan. Jangan berikan kode ini kepada siapa pun.\nJika Anda tidak meminta kode, abaikan pesan ini.'});}
  catch(e){ksbPatch_('AUTH_CHALLENGES',cid,{used:'TRUE'});throw new Error('Pengiriman email gagal. Periksa kuota MailApp dan izin pengiriman.');}
  return {challengeId:cid,maskedEmail:email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2'),expiresInSeconds:1200};
}
/** Verify a known challenge OR a still-valid code from the same email and role.
 *  A previous code can be entered after a page refresh or OTP-send rate limit.
 *  This NEVER generates or resends an OTP and NEVER bypasses the 5-attempt limit.
 */
function ksbOtpVerify_(args){
  args=args||{};
  var cid=ksbString_(args.challengeId||'',90).trim();
  var code=ksbString_(args.code,8);
  ksbRequire_(/^\d{8}$/.test(code),'Kode harus 8 digit.');
  var lookupEmail='', lookupRole='';
  if(!cid){
    lookupEmail=ksbEmail_(args.email);
    lookupRole=ksbString_(args.role||'',20).toUpperCase();
    ksbRequire_(['BUYER','SELLER','COURIER','ADMIN'].indexOf(lookupRole)>=0,'Peran tidak dikenal.');
  }
  return ksbWithLock_(function(){
    var candidates=[];
    if(cid){
      var direct=ksbRow_('AUTH_CHALLENGES',cid);
      if(direct)candidates=[direct];
    }else{
      candidates=ksbRows_('AUTH_CHALLENGES').filter(function(r){
        return String(r.email).toLowerCase()===lookupEmail &&
          String(r.role).toUpperCase()===lookupRole &&
          !ksbBool_(r.used) && Number(r.expires_at)>Date.now() && Number(r.attempts||0)<5;
      }).sort(function(a,b){return String(b.created_at||'').localeCompare(String(a.created_at||''));});
    }
    var matched=null, now=Date.now();
    for(var i=0;i<candidates.length;i++){
      var ch=candidates[i];
      if(ksbBool_(ch.used)||Number(ch.expires_at)<=now||Number(ch.attempts||0)>=5)continue;
      // Count unsuccessful attempts before examining the digest, under LockService.
      ksbPatch_('AUTH_CHALLENGES',ch.id,{attempts:String(Number(ch.attempts||0)+1)});
      if(ch.code_hash===ksbOtpDigest_(ch.id,ch.email,code)){matched=ch;break;}
    }
    ksbRequire_(matched,'Kode salah, kedaluwarsa, atau tidak berlaku.');
    ksbPatch_('AUTH_CHALLENGES',matched.id,{used:'TRUE'});
    var user=ksbFilter_('USERS',function(u){return u.email===matched.email;})[0];
    if(!user){
      user=ksbAppend_('USERS',{id:ksbId_('USR'),email:matched.email,display_name:matched.email.split('@')[0],active:'TRUE',created_at:ksbNow_(),updated_at:ksbNow_()});
      ksbAppend_('ROLES',{id:ksbId_('ROL'),user_id:user.id,role:'BUYER',status:'APPROVED',created_at:ksbNow_()});
    }
    return ksbNewSessionForUser_(user);
  });
}
