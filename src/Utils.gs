/** Generic Sheet store. Stable UUID keys: sheet row number is never an external identifier. */
function ksbNow_(){ return Utilities.formatDate(new Date(), KSB_CFG.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function ksbId_(prefix){return prefix+'_'+Utilities.getUuid().replace(/-/g,'').slice(0,24);}
function ksbFail_(message){throw new Error(message);}
function ksbRequire_(x,message){if(!x)ksbFail_(message||'Data wajib diisi.');}
function ksbAmount_(x,label){var n=Number(x);ksbRequire_(Number.isSafeInteger(n)&&n>=0,(label||'Nominal')+' tidak valid.');return n;}
function ksbString_(x,max){var s=String(x===null||x===undefined?'':x).trim();ksbRequire_(s.length<=(max||300),'Teks terlalu panjang.');return s;}
function ksbEmail_(x){var s=ksbString_(x,254).toLowerCase();ksbRequire_(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),'Email tidak valid');return s;}
function ksbBool_(x){return x===true||x==='TRUE'||x==='true';}
function ksbJson_(s,def){try{return JSON.parse(String(s||''));}catch(e){return def;}}
function ksbSha_(x){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(x)).map(function(b){return('0'+(b&255).toString(16)).slice(-2);}).join('');}
function ksbBook_(){var id=ksbProperty_('SPREADSHEET_ID');ksbRequire_(id,'Jalankan installProject_() terlebih dahulu.');return SpreadsheetApp.openById(id);}
function ksbSheet_(name){var s=ksbBook_().getSheetByName(name);ksbRequire_(s,'Tabel '+name+' belum dibuat.');return s;}
function ksbHeaders_(name){return ksbSheet_(name).getRange(1,1,1,ksbSheet_(name).getLastColumn()).getDisplayValues()[0];}
function ksbRows_(name){var sh=ksbSheet_(name),last=sh.getLastRow();if(last<2)return [];var heads=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];return sh.getRange(2,1,last-1,heads.length).getDisplayValues().map(function(vals){var row={};heads.forEach(function(h,i){row[h]=vals[i];});return row;});}
function ksbRow_(name,id){return ksbRows_(name).find(function(r){return r.id===String(id);})||null;}
function ksbFilter_(name,predicate){return ksbRows_(name).filter(predicate);}
function ksbSafeCell_(value){var s=String(value===undefined||value===null?'':value);return /^[\s]*[=+@]/.test(s)?"'"+s:s;}
function ksbAppend_(name,data){var sh=ksbSheet_(name),heads=ksbHeaders_(name),row={};heads.forEach(function(h){row[h]=(data[h]===undefined||data[h]===null)?'':String(data[h]);});ksbRequire_(row.id,'ID baris wajib');sh.getRange(sh.getLastRow()+1,1,1,heads.length).setNumberFormat('@').setValues([heads.map(function(h){return ksbSafeCell_(row[h]);})]);return row;}
function ksbPatch_(name,id,fields){var sh=ksbSheet_(name),heads=ksbHeaders_(name),col=heads.indexOf('id');ksbRequire_(col>=0,'ID tabel hilang');var last=sh.getLastRow();ksbRequire_(last>=2,'Record '+id+' tidak ada');var keys=sh.getRange(2,col+1,last-1,1).getDisplayValues().map(function(r){return r[0];});var i=keys.indexOf(String(id));ksbRequire_(i>=0,'Record '+id+' tidak ditemukan.');var range=sh.getRange(i+2,1,1,heads.length),vals=range.getDisplayValues()[0];Object.keys(fields).forEach(function(k){var j=heads.indexOf(k);ksbRequire_(j>=0,'Kolom tak dikenali: '+k);ksbRequire_(k!=='id','ID tidak dapat diganti');vals[j]=String(fields[k]===null?'':fields[k]);});range.setNumberFormat('@').setValues([vals.map(ksbSafeCell_)]);return ksbRow_(name,id);}
function ksbWithLock_(fn){var lock=LockService.getScriptLock();ksbRequire_(lock.tryLock(28000),'Sistem sibuk, coba lagi.');try{return fn();}finally{lock.releaseLock();}}
function ksbAudit_(actor,action,entity,id,detail){ksbAppend_('AUDIT_LOGS',{id:ksbId_('AUD'),actor_id:actor||'SYSTEM',action:action,entity_type:entity,entity_id:id,detail_json:JSON.stringify(detail||{}),created_at:ksbNow_()});}
function ksbHistory_(orderId,entity,status,actor,notes){ksbAppend_('ORDER_STATUS_HISTORY',{id:ksbId_('OSH'),order_id:orderId,entity:entity,status:status,actor_id:actor||'SYSTEM',notes:notes||'',created_at:ksbNow_()});}
function ksbPagination_(rows,args){var page=Math.max(1,Math.min(100000,Number(args.page)||1)),size=Math.max(1,Math.min(40,Number(args.size)||15));return {items:rows.slice((page-1)*size,page*size),page:page,size:size,total:rows.length,hasMore:page*size<rows.length};}
function ksbIdempotent_(actor,action,key,fn){ksbRequire_(/^[\w.:-]{8,100}$/.test(String(key||'')),'Kunci transaksi invalid');return ksbWithLock_(function(){var id=ksbSha_(actor.id+'|'+action+'|'+key),old=ksbRow_('IDEMPOTENCY_KEYS',id);if(old){if(old.status==='DONE')return ksbJson_(old.response_json,{});ksbFail_('Transaksi pernah dimulai dan perlu diperiksa: '+id);}ksbAppend_('IDEMPOTENCY_KEYS',{id:id,actor_id:actor.id,action:action,request_key:key,status:'PROCESSING',response_json:'',created_at:ksbNow_()});try{var result=fn();ksbPatch_('IDEMPOTENCY_KEYS',id,{status:'DONE',response_json:JSON.stringify(result)});return result;}catch(e){ksbPatch_('IDEMPOTENCY_KEYS',id,{status:'ERROR',response_json:JSON.stringify({message:e.message})});throw e;}});}
function ksbSettings_(){var out={};ksbRows_('APP_SETTINGS').forEach(function(r){out[r.key]=r.value;});return out;}
function ksbSettingNumber_(key, fallback){var value=ksbSettings_()[key];return value===undefined?fallback:ksbAmount_(value,key);}
function ksbPageSort_(rows,field){return rows.sort(function(a,b){return String(b[field]||'').localeCompare(String(a[field]||''));});}
function ksbAssetFolder_(){var folder=ksbProperty_('DRIVE_FOLDER_ID');ksbRequire_(folder,'Folder Drive belum dikonfigurasi.');return DriveApp.getFolderById(folder);}
