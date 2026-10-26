/**
 * KSB GO manual bank/QRIS book. This is an INTERNAL TRANSCRIPTION of bank/QRIS
 * statements, not a banking API and not proof by itself that money moved.
 * Never call an upload or user's receipt a verified bank transaction.
 */
function ksbBankEvidence_(reference, direction, amount) {
  var ref=ksbString_(reference,100),n=ksbAmount_(amount,'Nominal mutasi');
  return ksbFilter_('BANK_MUTATIONS_V11',function(r){
    return r.reference===ref && r.direction===direction && Number(r.amount)===n &&
      (r.status==='UNMATCHED'||r.status==='MATCHED');
  })[0]||null;
}
function ksbBankAssertUnmatched_(reference,direction,amount){
  var entry=ksbBankEvidence_(reference,direction,amount);
  ksbRequire_(entry && entry.status==='UNMATCHED' && !entry.matched_entity_id,
    'Mutasi bank/QRIS yang belum dipakai dan sesuai jumlah+referensi belum tercatat. Catat dari laporan resmi terlebih dahulu.');
  return entry;
}
function ksbAdminBankMutationCreate_(actor,args){
  ksbV10RequireCommerce_();ksbRole_(actor,'ADMIN');
  var ref=ksbString_(args.reference,100),direction=ksbString_(args.direction,12),channel=ksbString_(args.channel,20);
  var amount=ksbAmount_(args.amount,'Nominal');
  ksbRequire_(amount>0,'Nominal wajib positif.');
  ksbRequire_(['CREDIT','DEBIT'].indexOf(direction)>=0,'Arah mutasi tidak dikenal.');
  ksbRequire_(['BANK','QRIS'].indexOf(channel)>=0,'Channel harus BANK atau QRIS.');
  ksbV10ValidateBankReference_(ref);
  ksbRequire_(args.confirmIndependentStatement===true,
    'Wajib cocokkan mutasi dengan rekening/merchant QRIS resmi di luar website.');
  var date=ksbString_(args.bankDate,30);
  ksbRequire_(/^\d{4}-\d{2}-\d{2}$/.test(date),'Tanggal bank wajib YYYY-MM-DD.');
  return ksbWithLock_(function(){
    ksbRequire_(!ksbFilter_('BANK_MUTATIONS_V11',function(r){return r.reference===ref&&r.direction===direction;}).length,
      'Referensi+arah mutasi sudah dicatat; dilarang duplikat.');
    var id=ksbId_('BM');
    ksbAppend_('BANK_MUTATIONS_V11',{id:id,reference:ref,direction:direction,channel:channel,
      amount:amount,bank_date:date,description:ksbString_(args.description||'',300),
      status:'UNMATCHED',matched_entity_type:'',matched_entity_id:'',created_by:actor.id,
      created_at:ksbNow_(),matched_at:''});
    ksbAudit_(actor.id,'BANK_MUTATION_RECORDED','BANK_MUTATION',id,
      {reference:ref,direction:direction,amount:amount,channel:channel});
    return {id:id,status:'UNMATCHED'};
  });
}
function ksbAdminBankMutations_(actor,args){
  ksbRole_(actor,'ADMIN');
  var rows=ksbRows_('BANK_MUTATIONS_V11');
  if(args.status)rows=rows.filter(function(x){return x.status===String(args.status);});
  var unmatched=rows.filter(function(x){return x.status==='UNMATCHED';});
  return {list:ksbPagination_(ksbPageSort_(rows,'created_at'),args||{}),
    unmatchedCredits:unmatched.filter(function(x){return x.direction==='CREDIT';}).reduce(function(s,x){return s+Number(x.amount);},0),
    unmatchedDebits:unmatched.filter(function(x){return x.direction==='DEBIT';}).reduce(function(s,x){return s+Number(x.amount);},0)};
}
/** Lists ledger obligations and mutation discrepancies to investigate daily. */
function ksbAdminReconciliationSummary_(actor){
  ksbRole_(actor,'ADMIN');
  var all=ksbRows_('BANK_MUTATIONS_V11'),pending=all.filter(function(x){return x.status==='UNMATCHED';});
  var payments=ksbRows_('PAYMENTS'),claims=ksbRows_('MANUAL_CLAIMS_V7');
  var matchedCredits=all.filter(function(x){return x.direction==='CREDIT'&&x.status==='MATCHED';}).reduce(function(s,x){return s+Number(x.amount);},0);
  var matchedDebits=all.filter(function(x){return x.direction==='DEBIT'&&x.status==='MATCHED';}).reduce(function(s,x){return s+Number(x.amount);},0);
  return {pendingPayments:payments.filter(function(p){return p.method==='TRANSFER'&&p.status!=='VERIFIED';}).length,
    pendingPartnerClaims:claims.filter(function(c){return c.status==='PENDING'||c.status==='APPROVED';}).length,
    unmatchedMutationCount:pending.length,unmatchedCredits:pending.filter(function(x){return x.direction==='CREDIT';}).reduce(function(s,x){return s+Number(x.amount);},0),
    unmatchedDebits:pending.filter(function(x){return x.direction==='DEBIT';}).reduce(function(s,x){return s+Number(x.amount);},0),
    matchedCredits:matchedCredits,matchedDebits:matchedDebits,
    sellerPayable:ksbAccountBalance_('PAYABLE_SELLER'),courierPayable:ksbAccountBalance_('PAYABLE_COURIER'),
    recordedCash:ksbCashBalance_(),
    notice:'Angka tercatat bukan saldo bank. Cocokkan dengan mutasi resmi per hari dan investigasi selisih sebelum pencairan.'};
}
function migrateReconciliationV11_(){
  var name='BANK_MUTATIONS_V11',book=ksbBook_(),heads=KSB_SCHEMA[name].split(',');
  var sh=book.getSheetByName(name)||book.insertSheet(name);
  if(sh.getLastRow()===0){sh.getRange(1,1,1,heads.length).setValues([heads]);sh.setFrozenRows(1);}
  else {var old=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    ksbRequire_(heads.join(',')===old.join(','),'Skema BANK_MUTATIONS_V11 tidak cocok, stop migrasi.');}
  return {ok:true,table:name,rows:Math.max(0,sh.getLastRow()-1)};
}
