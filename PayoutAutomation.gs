/** Staging automatic payout planner. TEST ONLY, never live. */
function ksbPayoutReserved_(partyId,type){return ksbFilter_('PAYOUT_REQUESTS',function(x){return x.party_id===partyId&&x.party_type===type&&['QUEUED','SENDING','REQUESTED','REVIEW_REQUIRED'].indexOf(x.status)>=0;}).reduce(function(sum,x){return sum+Number(x.amount);},0);}
function ksbPayoutDisputed_(partyId){var ids=ksbFilter_('LEDGER_ENTRIES',function(e){return e.party_id===partyId&&e.account.indexOf('PAYABLE_')===0&&e.order_id;}).map(function(e){return e.order_id;});return ksbFilter_('ORDERS',function(o){return ids.indexOf(o.id)>=0&&['DISPUTED'].indexOf(o.status)>=0;}).length>0;}
function ksbPayoutEligible_(account,partyId,type,minValue){
  var balance=ksbAccountBalance_(account,partyId),held=ksbPayoutReserved_(partyId,type),available=balance-held;
  return !ksbPayoutDisputed_(partyId)&&available>=minValue?available:0;
}
function ksbPayoutAccountFingerprint_(a){return ksbSha_(a.id+'|'+a.bank_name+'|'+a.account_number+'|'+a.account_holder+'|'+a.verified_at);}
function ksbAdminGatewayPayouts_(actor,args){ksbRole_(actor,'ADMIN');return ksbPagination_(ksbPageSort_(ksbRows_('PAYOUT_REQUESTS'),'created_at'),args||{});}
function ksbAdminQueuePayout_(actor,args){ksbRole_(actor,'ADMIN');ksbRequire_(ksbProperty_('KSB_V7_MANUAL_CLAIMS','0')!=='1','Payout gateway tidak boleh dicampur dengan pengajuan manual V7.');return ksbPayoutQueue_(String(args.partyId||''),String(args.partyType||''),Number(args.amount||0),actor.id);}
function ksbPayoutQueue_(partyId,type,requested,actor){
 ksbGatewayEnabled_();ksbRequire_(['SELLER','COURIER'].indexOf(type)>=0,'Jenis mitra invalid');
 return ksbWithLock_(function(){
   var account=ksbPayoutForParty_(partyId,type),ledger=type==='SELLER'?'PAYABLE_SELLER':'PAYABLE_COURIER',min=ksbSettingNumber_('payout_min_idr',50000);
   ksbRequire_(ksbRow_('USERS',partyId),'Mitra tidak ada');
   ksbRequire_(account&&account.status==='VERIFIED','Rekening mitra wajib disetujui admin');
   var eligible=ksbPayoutEligible_(ledger,partyId,type,min),amount=requested||eligible;
   ksbRequire_(Number.isSafeInteger(amount)&&amount>=min&&amount<=eligible,'Saldo tidak cukup atau belum memenuhi minimum pencairan.');
   var held=ksbRows_('PAYOUT_REQUESTS').filter(function(p){return ['QUEUED','SENDING','REQUESTED','REVIEW_REQUIRED'].indexOf(p.status)>=0;}).reduce(function(s,p){return s+Number(p.amount);},0);
   ksbRequire_(ksbCashBalance_()>=amount+held+ksbSettingNumber_('payout_cash_buffer_idr',100000),'Kas minimum atau saldo rekening belum cukup. Pastikan settlement gateway ke rekening sumber.');
   var id=ksbId_('PO'),now=ksbNow_();ksbAppend_('PAYOUT_REQUESTS',{id:id,party_id:partyId,party_type:type,account_id:account.id,account_fingerprint:ksbPayoutAccountFingerprint_(account),amount:amount,provider:'XENDIT_TEST',provider_payout_id:'',reference_id:id,status:'QUEUED',error:'',created_at:now,updated_at:now});
   ksbAudit_(actor,'PAYOUT_QUEUED','PAYOUT_REQUEST',id,{amount:amount,type:type});return {id:id,amount:amount,status:'QUEUED'};
 });
}
/** Activate hourly via installGatewayTriggersV3_, only after confirming test_ bank routing. */
function ksbGatewayPayoutSweep_(){
 ksbGatewayEnabled_();if(ksbProperty_('PAYOUT_TEST_RUN')!=='1')return {status:'DISABLED',note:'Set PAYOUT_TEST_RUN=1 after verifying provider test_ routing.'};
 var result={queued:[],submitted:[]};
 var ids=ksbRows_('PARTNER_PAYOUT_ACCOUNTS').filter(function(a){return a.status==='VERIFIED';});
 ids.slice(0,12).forEach(function(a){try{var type=a.party_type,acct=type==='SELLER'?'PAYABLE_SELLER':'PAYABLE_COURIER',min=ksbSettingNumber_('payout_min_idr',50000),value=ksbPayoutEligible_(acct,a.party_id,type,min);if(value>0)result.queued.push(ksbPayoutQueue_(a.party_id,type,value,'SYSTEM_AUTO').id);}catch(e){console.error('Queue payout '+a.id+': '+e.message);}});
 ksbRows_('PAYOUT_REQUESTS').filter(function(x){return x.status==='QUEUED';}).slice(0,12).forEach(function(x){try{result.submitted.push(ksbPayoutSubmit_(x.id));}catch(e){console.error('Payout submit '+x.id+': '+e.message);}});
 return result;
}
function ksbPayoutPayload_(request,bank){
  var mapping=ksbJson_(ksbProperty_('PAYOUT_BANK_ROUTING_JSON','{}'),{}),routing=mapping[String(bank.bank_name).toUpperCase()];
  ksbRequire_(routing&&['SWIFT','IBAN','SORT_CODE','ABA','BSB','WALLET','CLABE','MOBILE_NO','BUSINESS_REG_NO','NATIONAL_ID'].indexOf(routing.routing_type)>=0&&String(routing.routing_value||'').length>=3,'Pemetaan routing bank belum dikonfirmasi dari Xendit untuk bank '+bank.bank_name);
  var name=String(bank.account_holder).trim(),parts=name.split(/\s+/);
  return {reference_id:request.reference_id,recipient:{type:'INDIVIDUAL',given_name:parts[0],surname:parts.slice(1).join(' ')||parts[0],relationship:'BUSINESS_PARTNER',account_details:{currency:'IDR',account_country:'ID',account_holder_name:name,account_number:bank.account_number,routing_type_1:routing.routing_type,routing_value_1:routing.routing_value}},payout_details:{source_currency:'IDR',source_amount:Number(request.amount),destination_currency:'IDR'},source_of_fund:'BUSINESS_REVENUE',purpose_code:request.party_type==='SELLER'?'TRADES':'DELIVERY',description:'KSB GO '+request.reference_id};
}
function ksbPayoutSubmit_(requestId){
 ksbGatewayEnabled_();ksbRequire_(ksbProperty_('PAYOUT_TEST_RUN')==='1','Payout TEST otomatis belum disetujui admin.');
 var ready=ksbWithLock_(function(){var p=ksbRow_('PAYOUT_REQUESTS',requestId);ksbRequire_(p&&p.status==='QUEUED','Payout tidak dalam antrean');var bank=ksbRow_('PARTNER_PAYOUT_ACCOUNTS',p.account_id);ksbRequire_(bank&&bank.status==='VERIFIED'&&ksbPayoutAccountFingerprint_(bank)===p.account_fingerprint,'Rekening berubah, payout harus ditinjau ulang.');var payload=ksbPayoutPayload_(p,bank);ksbPatch_('PAYOUT_REQUESTS',p.id,{status:'SENDING',updated_at:ksbNow_()});return {id:p.id,payload:payload};});
 try{
   var r=ksbXenditRequest_('post','/v3/payouts',ready.payload,{'api-version':'2025-09-01','idempotency-key':ready.id});
   ksbRequire_(r.payout_id&&r.reference_id===ready.id,'Provider mengembalikan identitas payout yang tidak cocok');
   ksbWithLock_(function(){ksbPatch_('PAYOUT_REQUESTS',ready.id,{provider_payout_id:r.payout_id,status:'REQUESTED',updated_at:ksbNow_()});});
   return {id:ready.id,status:r.status,payoutId:r.payout_id};
 }catch(e){ksbWithLock_(function(){ksbPatch_('PAYOUT_REQUESTS',ready.id,{status:'REVIEW_REQUIRED',error:String(e.message).slice(0,180),updated_at:ksbNow_()});});throw e;}
}
function ksbPayoutReconcile_(id){
 ksbGatewayEnabled_();var p=ksbRow_('PAYOUT_REQUESTS',id);ksbRequire_(p&&p.provider_payout_id,'Payout belum memiliki ID dari provider.');
 var live=ksbXenditRequest_('get','/v3/payouts/'+encodeURIComponent(p.provider_payout_id),null,{'api-version':'2025-09-01'});
 return ksbWithLock_(function(){
   var r=ksbRow_('PAYOUT_REQUESTS',id),a=ksbRow_('PARTNER_PAYOUT_ACCOUNTS',r.account_id);
   ksbRequire_(live.payout_id===r.provider_payout_id&&live.reference_id===r.reference_id,'Identitas payout tidak cocok');
   ksbRequire_(live.source_currency==='IDR'&&Number(live.source_amount)===Number(r.amount),'Jumlah payout berubah! Investigasi manual.');
   if(live.status==='SUCCEEDED'&&r.status!=='SUCCEEDED'){
     if(!a||ksbPayoutAccountFingerprint_(a)!==r.account_fingerprint)ksbAudit_('GATEWAY_XENDIT_TEST','BANK_CHANGED_AFTER_PAYOUT_SUBMISSION','PAYOUT_REQUEST',id,{reviewRequired:true});
     var acc=r.party_type==='SELLER'?'PAYABLE_SELLER':'PAYABLE_COURIER',n=Number(r.amount);
     ksbJournal_('GATEWAY_PAYOUT',id,'','Payout test_ berhasil menurut Xendit',[{account:acc,party_id:r.party_id,debit:n},{account:'CASH_PLATFORM',credit:n}]);
     ksbAppend_('SETTLEMENTS',{id:ksbId_('STL'),party_id:r.party_id,party_type:r.party_type,amount:n,bank_reference:live.payout_id,status:'PAID',created_by:'GATEWAY_TEST',created_at:ksbNow_()});
   }
   if(live.status==='REVERSED'&&r.status==='SUCCEEDED'){
     ksbJournal_('GATEWAY_PAYOUT_REVERSED',id,'','Bank mengembalikan payout test_',[{account:'CASH_PLATFORM',debit:Number(r.amount)},{account:r.party_type==='SELLER'?'PAYABLE_SELLER':'PAYABLE_COURIER',party_id:r.party_id,credit:Number(r.amount)}]);
     ksbFilter_('SETTLEMENTS',function(s){return s.bank_reference===live.payout_id;}).forEach(function(s){ksbPatch_('SETTLEMENTS',s.id,{status:'REVERSED'});});
   }
   var statuses=['SUCCEEDED','FAILED','REJECTED','CANCELLED','EXPIRED','REVERSED'];
   ksbPatch_('PAYOUT_REQUESTS',id,{status:statuses.indexOf(live.status)>=0?live.status:'REQUESTED',updated_at:ksbNow_()});
   return {id:id,status:live.status};
 });
}
