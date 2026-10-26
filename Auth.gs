function ksbGoogleLogin_(args){
  var token=String(args.idToken||'');ksbRequire_(token.length>100&&token.length<12000,'Token Google diperlukan.');
  var response=UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(token),{muteHttpExceptions:true});
  ksbRequire_(response.getResponseCode()===200,'Token Google gagal diverifikasi.');
  var p=JSON.parse(response.getContentText()),client=ksbProperty_('GOOGLE_CLIENT_ID');
  ksbRequire_(client&&p.aud===client,'Google Client ID tidak sesuai.');
  ksbRequire_(['accounts.google.com','https://accounts.google.com'].indexOf(p.iss)>=0&&Number(p.exp)*1000>Date.now(),'Token telah kedaluwarsa.');
  ksbRequire_(p.email_verified===true||p.email_verified==='true','Email Google belum diverifikasi.');
  var email=ksbEmail_(p.email);ksbRequire_(ksbAuthAllowed_(email),'Email Google ini belum diizinkan untuk staging.');var user=ksbFilter_('USERS',function(r){return r.email===email;})[0];
  return ksbWithLock_(function(){
    user=ksbFilter_('USERS',function(r){return r.email===email;})[0];
    if(!user){user=ksbAppend_('USERS',{id:ksbId_('USR'),email:email,display_name:ksbString_(p.name||email,100),active:'TRUE',created_at:ksbNow_(),updated_at:ksbNow_()});ksbAppend_('ROLES',{id:ksbId_('ROL'),user_id:user.id,role:'BUYER',status:'APPROVED',created_at:ksbNow_()});}
    ksbRequire_(ksbBool_(user.active),'Akun dinonaktifkan.');
    var adminEmail=ksbProperty_('ADMIN_EMAIL').toLowerCase();
    if(adminEmail===email&&!ksbFilter_('ROLES',function(r){return r.user_id===user.id&&r.role==='ADMIN';}).length)ksbAppend_('ROLES',{id:ksbId_('ROL'),user_id:user.id,role:'ADMIN',status:'APPROVED',created_at:ksbNow_()});
    return ksbNewSessionForUser_(user);
  });
}
function ksbActor_(sessionToken){
  var str=String(sessionToken||''),parts=str.split('.');ksbRequire_(parts.length===2,'Silakan login terlebih dahulu.');
  var session=ksbRow_('USER_SESSIONS',parts[0]);
  ksbRequire_(session&&!ksbBool_(session.revoked)&&Number(session.expires_at)>Date.now()&&ksbSha_(parts[1])===session.token_hash,'Sesi login tidak berlaku.');
  var user=ksbRow_('USERS',session.user_id);ksbRequire_(user&&ksbBool_(user.active),'Pengguna tidak aktif.');
  return {id:user.id,email:user.email,name:user.display_name,phone:user.phone,roles:ksbFilter_('ROLES',function(r){return r.user_id===user.id&&r.status==='APPROVED';}).filter(function(r){return r.role!=='ADMIN'||user.email===String(ksbProperty_('ADMIN_EMAIL')||'').toLowerCase();}).map(function(r){return r.role;}),sessionId:session.id};
}
function ksbSafeUser_(user){return {id:user.id,name:user.display_name,email:user.email,phone:user.phone,roles:ksbFilter_('ROLES',function(r){return r.user_id===user.id&&r.status==='APPROVED';}).filter(function(r){return r.role!=='ADMIN'||user.email===String(ksbProperty_('ADMIN_EMAIL')||'').toLowerCase();}).map(function(r){return r.role;})};}
function ksbRole_(actor,role){ksbRequire_(actor.roles.indexOf(role)>=0,'Anda tidak berwenang untuk tindakan ini ('+role+').');}
function ksbAnyRole_(actor,roles){ksbRequire_(roles.some(function(r){return actor.roles.indexOf(r)>=0;}),'Tidak memiliki izin.');}
function ksbLogout_(actor){ksbPatch_('USER_SESSIONS',actor.sessionId,{revoked:'TRUE'});return {ok:true};}
function ksbMe_(actor){return ksbSafeUser_(ksbRow_('USERS',actor.id));}
function ksbApplyRole_(actor,args){var role=ksbString_(args.role,20);ksbRequire_(['SELLER','COURIER'].indexOf(role)>=0,'Role tidak valid.');if(role==='COURIER')ksbRequire_(ksbRow_('USERS',actor.id).phone,'Lengkapi nomor WhatsApp di profil sebelum mendaftar sebagai kurir.');return ksbWithLock_(function(){
  var existing=ksbFilter_('ROLES',function(r){return r.user_id===actor.id&&r.role===role;})[0];ksbRequire_(!existing,'Pengajuan sudah ada.');
  ksbAppend_('ROLES',{id:ksbId_('ROL'),user_id:actor.id,role:role,status:'PENDING',created_at:ksbNow_()});
  if(role==='SELLER')ksbAppend_('SELLERS',{id:ksbId_('SEL'),user_id:actor.id,verified:'FALSE',billing_cycle:'MONTHLY',created_at:ksbNow_()});
  if(role==='COURIER')ksbAppend_('COURIERS',{id:ksbId_('COU'),user_id:actor.id,verified:'FALSE',online:'FALSE',vehicle:ksbString_(args.vehicle||'',80),phone:ksbString_(args.phone||ksbRow_('USERS',actor.id).phone||'',25),billing_cycle:'MONTHLY',created_at:ksbNow_()});
  ksbAudit_(actor.id,'APPLY_ROLE','ROLE',role,{});return {status:'PENDING'};
});}
function ksbUpdateProfile_(actor,args){ksbPatch_('USERS',actor.id,{display_name:ksbString_(args.name,100),phone:ksbString_(args.phone,25),updated_at:ksbNow_()});var courier=ksbFilter_('COURIERS',function(c){return c.user_id===actor.id;})[0];if(courier)ksbPatch_('COURIERS',courier.id,{phone:ksbString_(args.phone,25)});return ksbMe_(actor);}
function ksbOwnStore_(actor,storeId){ksbRole_(actor,'SELLER');var store=ksbRow_('SELLER_STORES',storeId);ksbRequire_(store,'Toko tidak ada.');var s=ksbRow_('SELLERS',store.seller_id);ksbRequire_(s&&s.user_id===actor.id,'Toko bukan milik Anda.');return store;}
function ksbOwnCourier_(actor){ksbRole_(actor,'COURIER');var c=ksbFilter_('COURIERS',function(x){return x.user_id===actor.id&&ksbBool_(x.verified);})[0];ksbRequire_(c,'Kurir belum diverifikasi admin.');return c;}
function ksbSellerStore_(actor){ksbRole_(actor,'SELLER');var seller=ksbFilter_('SELLERS',function(x){return x.user_id===actor.id&&ksbBool_(x.verified);})[0];ksbRequire_(seller,'Seller belum disetujui.');return ksbFilter_('SELLER_STORES',function(r){return r.seller_id===seller.id;})[0]||null;}

/** Called only after a verified Google ID token or single-use email OTP. */
function ksbNewSessionForUser_(user){
  ksbRequire_(user&&ksbBool_(user.active),'Akun tidak aktif.');
  var adminEmail=ksbEmail_(ksbProperty_('ADMIN_EMAIL')||'admin@example.invalid');
  if(user.email===adminEmail&&!ksbFilter_('ROLES',function(r){return r.user_id===user.id&&r.role==='ADMIN'&&r.status==='APPROVED';}).length){
    ksbAppend_('ROLES',{id:ksbId_('ROL'),user_id:user.id,role:'ADMIN',status:'APPROVED',created_at:ksbNow_()});
  }
  var secret=Utilities.getUuid()+'-'+Utilities.getUuid()+'-'+Utilities.getUuid(),sessionId=ksbId_('SES');
  ksbAppend_('USER_SESSIONS',{id:sessionId,user_id:user.id,token_hash:ksbSha_(secret),expires_at:String(Date.now()+KSB_CFG.SESSION_MAX_HOURS*3600000),revoked:'FALSE',created_at:ksbNow_()});
  ksbAudit_(user.id,'LOGIN','USER',user.id,{channel:'VERIFIED'});
  return {token:sessionId+'.'+secret,user:ksbSafeUser_(user)};
}
function ksbRoleStatuses_(actor){return ksbFilter_('ROLES',function(r){return r.user_id===actor.id;}).map(function(r){return {role:r.role,status:r.status};});}
