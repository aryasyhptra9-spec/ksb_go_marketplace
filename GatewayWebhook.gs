/** Only accept relayed requests signed by our webhook proxy. GAS does not expose HTTP request headers. */
function ksbGatewayHmac_(data,secret){return Utilities.computeHmacSha256Signature(data,secret).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function ksbConstantEquals_(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function doPost(e){
  try{
    ksbGatewayEnabled_();var envelope=ksbJson_(e&&e.postData&&e.postData.contents,{}),secret=ksbProperty_('WEBHOOK_RELAY_SECRET');
    ksbRequire_(secret.length>=32,'Rahasia webhook belum dikonfigurasi');
    var ts=Number(envelope.ts),eid=String(envelope.eventId||''),raw=String(envelope.rawB64||''),sig=String(envelope.signature||'');
    ksbRequire_(Number.isSafeInteger(ts)&&Math.abs(Date.now()-ts)<300000,'Webhook kedaluwarsa');
    ksbRequire_(/^[0-9a-f]{64}$/.test(eid)&&raw.length<100000,'Identitas webhook tidak valid');
    ksbRequire_(ksbConstantEquals_(ksbGatewayHmac_(String(ts)+'\n'+eid+'\n'+raw,secret),sig),'Signature webhook tidak cocok');
    var payload=ksbJson_(Utilities.newBlob(Utilities.base64Decode(raw)).getDataAsString('UTF-8'),null);
    ksbRequire_(payload&&typeof payload==='object','Webhook bukan JSON');
    var eventType=String(payload.event||payload.event_type||'');
    ksbRequire_(['payment_session.completed','payment_session.expired','payment_session.canceled','v3_payout.succeeded','v3_payout.failed','v3_payout.reversed','v3_payout.rejected','v3_payout.pending_compliance'].indexOf(eventType)>=0,'Webhook tidak dikenali');
    var result=ksbWithLock_(function(){var old=ksbFilter_('GATEWAY_EVENTS',function(x){return x.event_id===eid;})[0];if(old)return 'duplicate';
      ksbAppend_('GATEWAY_EVENTS',{id:ksbId_('GE'),event_id:eid,event_type:eventType,raw_json:JSON.stringify(payload).slice(0,50000),status:'RECEIVED',attempts:0,error:'',created_at:ksbNow_(),processed_at:''});return 'accepted';});
    return ContentService.createTextOutput(JSON.stringify({ok:true,result:result})).setMimeType(ContentService.MimeType.JSON);
  }catch(error){console.error('Webhook rejected: '+error.message);return ContentService.createTextOutput(JSON.stringify({ok:false,error:'rejected'})).setMimeType(ContentService.MimeType.JSON);}
}
/** Run by hourly trigger; every event is re-checked against provider via authenticated GET. */
function ksbGatewayProcessEvents_(){ksbGatewayEnabled_();var rows=ksbRows_('GATEWAY_EVENTS').filter(function(e){return ['RECEIVED','ERROR'].indexOf(e.status)>=0&&Number(e.attempts)<5;}).slice(0,15);var n={processed:0,errors:0};
 rows.forEach(function(event){
  var reserved=ksbWithLock_(function(){var e=ksbRow_('GATEWAY_EVENTS',event.id);if(!e||['RECEIVED','ERROR'].indexOf(e.status)<0)return false;ksbPatch_('GATEWAY_EVENTS',e.id,{status:'PROCESSING',attempts:Number(e.attempts)+1});return true;});
  if(!reserved)return;
  try{var payload=ksbJson_(event.raw_json,{}),data=payload.data||{};
   if(event.event_type.indexOf('payment_session.')===0){var sid=String(data.payment_session_id||payload.payment_session_id||'');ksbRequire_(/^ps-[A-Za-z0-9-]+$/.test(sid),'Event tidak memuat session ID; perlu investigasi.');ksbGatewayReconcileSession_(sid);}
   else{var pid=String(data.payout_id||'');ksbRequire_(/^po-[A-Za-z0-9-]+$/.test(pid),'Webhook tidak memuat payout ID');var rec=ksbFilter_('PAYOUT_REQUESTS',function(x){return x.provider_payout_id===pid;})[0];ksbRequire_(rec,'Payout dari webhook tidak dikenali');ksbPayoutReconcile_(rec.id);}
   ksbPatch_('GATEWAY_EVENTS',event.id,{status:'PROCESSED',processed_at:ksbNow_(),error:''});n.processed++;
  }catch(err){ksbPatch_('GATEWAY_EVENTS',event.id,{status:'ERROR',error:String(err.message).slice(0,180)});n.errors++;}
 });return n;}
function ksbGatewayReconcileOpen_(){ksbGatewayEnabled_();var statuses=['ACTIVE','REQUESTED','SENDING'];var sessions=ksbRows_('GATEWAY_SESSIONS').filter(function(s){return s.provider_session_id&&s.status==='ACTIVE';}).slice(0,15);sessions.forEach(function(s){try{ksbGatewayReconcileSession_(s.provider_session_id);}catch(e){console.error('Session reconcile '+s.id+': '+e.message);}});ksbRows_('PAYOUT_REQUESTS').filter(function(p){return p.provider_payout_id&&statuses.indexOf(p.status)>=0;}).slice(0,15).forEach(function(p){try{ksbPayoutReconcile_(p.id);}catch(e){console.error('Payout reconcile '+p.id+': '+e.message);}});return {checkedSessions:sessions.length};}
function ksbGatewayHourly_(){var a=ksbGatewayProcessEvents_(),b=ksbGatewayReconcileOpen_(),c=ksbGatewayPayoutSweep_();return {events:a,reconciliation:b,payout:c};}
function installGatewayTriggersV3_(){ksbGatewayEnabled_();ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='ksbGatewayHourly_';}).forEach(ScriptApp.deleteTrigger);ScriptApp.newTrigger('ksbGatewayHourly_').timeBased().everyHours(1).create();return {ok:true,handler:'ksbGatewayHourly_',mode:'TEST'};}
/** Data-preserving upgrade from V2. Does not run migration on client calls. */
function migrateGatewayV3_(){
  var book=ksbBook_(),names=['GATEWAY_SESSIONS','GATEWAY_EVENTS','PAYOUT_REQUESTS','GATEWAY_SETTLEMENT_RECEIPTS'];
  names.forEach(function(name){var headers=KSB_SCHEMA[name].split(','),sh=book.getSheetByName(name);if(!sh){sh=book.insertSheet(name);sh.getRange(1,1,1,headers.length).setValues([headers]);sh.setFrozenRows(1);}else{var got=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];ksbRequire_(got.join(',')===headers.join(','),'Kolom tabel berbeda: '+name);}});
  var defaults={payout_min_idr:'50000',payout_cash_buffer_idr:'100000'};
  Object.keys(defaults).forEach(function(k){if(!ksbFilter_('APP_SETTINGS',function(s){return s.key===k;}).length)ksbAppend_('APP_SETTINGS',{id:ksbId_('SET'),key:k,value:defaults[k],description:'Konfigurasi payout staging',updated_at:ksbNow_()});});
  return {ok:true,tables:Object.keys(KSB_SCHEMA).length,newTables:names};
}
