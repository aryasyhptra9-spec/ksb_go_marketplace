/** Order-selected manual settlement requests; distinct from gateway PAYOUT_REQUESTS. */
function ksbClaimPartyV7_(actor,type){
 ksbRequire_(['SELLER','COURIER'].indexOf(type)>=0,'Jenis mitra harus SELLER/COURIER.');
 if(type==='SELLER')ksbRequire_(ksbSellerStore_(actor),'Toko belum dibuat.');
 else ksbOwnCourier_(actor);
 return actor.id;
}
function ksbClaimEligibleAllV7_(actor,type){
 ksbClaimPartyV7_(actor,type);
 var active=ksbRows_('MANUAL_CLAIM_ITEMS_V7').filter(function(i){var c=ksbRow_('MANUAL_CLAIMS_V7',i.claim_id);return c&&['PENDING','APPROVED','PAID'].indexOf(c.status)>=0;});
 var taken={};active.forEach(function(i){taken[i.claim_id+'|'+i.source_id]=true;});
 var blocked={};active.forEach(function(i){var c=ksbRow_('MANUAL_CLAIMS_V7',i.claim_id);blocked[c.party_type+':'+c.party_id+':'+i.source_id]=true;});
 var out=[],buyerReceipts=ksbV16BuyerReceiptMap_();
 if(type==='SELLER'){
  var store=ksbSellerStore_(actor);
  ksbFilter_('SELLER_ORDERS',function(so){return so.store_id===store.id&&so.status==='DELIVERED';}).forEach(function(so){
    var d=ksbRow_('DELIVERY_ORDERS',so.delivery_id),o=ksbRow_('ORDERS',so.order_id),amount=Number(so.subtotal)-Number(so.seller_fee_amount||0);
    if(!d||d.status!=='DELIVERED'||!buyerReceipts[d.id]||!o||o.status!=='DELIVERED'||o.payment_status!=='PAID'||o.payment_method!=='TRANSFER'||!d.proof_delivery_file||amount<=0||blocked[type+':'+actor.id+':'+so.id])return;
    if(!ksbFilter_('LEDGER_ENTRIES',function(e){return e.source_type==='DELIVERY_FINAL'&&e.source_id===d.id&&e.account==='PAYABLE_SELLER'&&e.party_id===actor.id;}).length)return;
    out.push({sourceId:so.id,orderId:o.id,amount:amount,type:type});
  });
 }else{
  var c=ksbOwnCourier_(actor);
  ksbFilter_('DELIVERY_ORDERS',function(d){return d.courier_id===c.id&&d.status==='DELIVERED';}).forEach(function(d){
    var o=ksbRow_('ORDERS',d.order_id),amount=Number(d.shipping_fee)-Number(d.courier_fee_amount||0);
    if(!buyerReceipts[d.id]||!o||o.status!=='DELIVERED'||o.payment_status!=='PAID'||o.payment_method!=='TRANSFER'||!d.proof_delivery_file||amount<=0||blocked[type+':'+actor.id+':'+d.id])return;
    if(!ksbFilter_('LEDGER_ENTRIES',function(e){return e.source_type==='DELIVERY_FINAL'&&e.source_id===d.id&&e.account==='PAYABLE_COURIER'&&e.party_id===actor.id;}).length)return;
    out.push({sourceId:d.id,orderId:o.id,amount:amount,type:type});
  });
 }
 return out;
}
function ksbClaimEligibleV7_(actor,args){var type=String(args.role||'');return {role:type,items:ksbClaimEligibleAllV7_(actor,type)};}
function ksbClaimMineV7_(actor,args){var type=String(args.role||'');ksbClaimPartyV7_(actor,type);return ksbPagination_(ksbPageSort_(ksbFilter_('MANUAL_CLAIMS_V7',function(x){return x.party_id===actor.id&&x.party_type===type;}),'created_at'),args||{});}
function ksbClaimCreateV7_(actor,args){
 ksbV10RequireCommerce_();
 var type=String(args.role||'');ksbClaimPartyV7_(actor,type);
 ksbRequire_(ksbProperty_('KSB_V7_MANUAL_CLAIMS','0')==='1','Pengajuan tagihan belum diaktifkan.');
 var ids=args.sourceIds;ksbRequire_(Array.isArray(ids)&&ids.length&&ids.length<=30,'Pilih 1–30 order selesai untuk ditagihkan.');
 ksbRequire_(new Set(ids).size===ids.length&&ids.every(function(x){return typeof x==='string'&&x.length<100;}),'Pilihan order tidak valid.');
 return ksbIdempotent_(actor,'MANUAL_CLAIM_V7',args.requestKey,function(){
  var acct=ksbPayoutForParty_(actor.id,type);ksbRequire_(acct&&acct.status==='VERIFIED','Rekening mitra belum diverifikasi admin.');
  var rows=ksbClaimEligibleAllV7_(actor,type),wanted=rows.filter(function(r){return ids.indexOf(r.sourceId)>=0;});ksbRequire_(wanted.length===ids.length,'Order sudah ditagih, tidak layak, atau belum selesai.');
  var total=wanted.reduce(function(s,r){return s+r.amount;},0),account=type==='SELLER'?'PAYABLE_SELLER':'PAYABLE_COURIER';
  var pending=ksbFilter_('MANUAL_CLAIMS_V7',function(c){return c.party_id===actor.id&&c.party_type===type&&['PENDING','APPROVED'].indexOf(c.status)>=0;}).reduce(function(s,r){return s+Number(r.total);},0);
  ksbRequire_(ksbAccountBalance_(account,actor.id)>=pending+total,'Saldo belum mencukupi. Hubungi admin untuk rekonsiliasi.');
  var id=ksbId_('MCL'),now=ksbNow_();
  ksbAppend_('MANUAL_CLAIMS_V7',{id:id,party_id:actor.id,party_type:type,bank_account_id:acct.id,bank_name:acct.bank_name,bank_number_masked:'••••'+String(acct.account_number).slice(-4),bank_number_hash:ksbSha_(acct.account_number),bank_holder:acct.account_holder,total:total,status:'PENDING',notes:ksbString_(args.notes||'',300),bank_reference:'',admin_id:'',created_at:now,reviewed_at:'',paid_at:''});
  wanted.forEach(function(r){ksbAppend_('MANUAL_CLAIM_ITEMS_V7',{id:ksbId_('MCI'),claim_id:id,source_id:r.sourceId,order_id:r.orderId,amount:r.amount,created_at:now});});
  ksbAudit_(actor.id,'CLAIM_CREATE_V7','MANUAL_CLAIM',id,{count:wanted.length,total:total});
  return {id:id,total:total,status:'PENDING',orders:wanted.length};
 });
}
function ksbAdminClaimsV7_(actor,args){ksbRole_(actor,'ADMIN');return ksbPagination_(ksbPageSort_(ksbRows_('MANUAL_CLAIMS_V7'),'created_at'),args||{});}
function ksbAdminClaimReviewV7_(actor,args){ksbV10RequireCommerce_();ksbRole_(actor,'ADMIN');return ksbWithLock_(function(){
  var claim=ksbRow_('MANUAL_CLAIMS_V7',args.id);ksbRequire_(claim&&claim.status==='PENDING','Tagihan tidak sedang menunggu persetujuan.');
  var result=args.approve===true?'APPROVED':'REJECTED';
  ksbPatch_('MANUAL_CLAIMS_V7',claim.id,{status:result,admin_id:actor.id,reviewed_at:ksbNow_()});
  ksbAudit_(actor.id,'CLAIM_REVIEW_V7','MANUAL_CLAIM',claim.id,{status:result});return {id:claim.id,status:result};
 });
}
function ksbAdminClaimPaidV7_(actor,args){ksbV10RequireCommerce_();ksbRole_(actor,'ADMIN');return ksbWithLock_(function(){
  var claim=ksbRow_('MANUAL_CLAIMS_V7',args.id);ksbRequire_(claim&&claim.status==='APPROVED','Tagihan harus disetujui dan belum pernah dicairkan.');
  ksbRequire_(args.confirmBankTransfer===true,'Admin harus melakukan transfer dan memeriksa bukti mutasi bank terlebih dahulu.');
  var acct=ksbPayoutForParty_(claim.party_id,claim.party_type);ksbRequire_(acct&&acct.id===claim.bank_account_id&&acct.status==='VERIFIED'&&ksbSha_(acct.account_number)===claim.bank_number_hash&&acct.account_holder===claim.bank_holder,'Rekening mitra berubah atau belum terverifikasi. Tolak dan minta pengajuan baru.');
  var ref=ksbString_(args.bankReference,100);ksbRequire_(ref,'Referensi bank wajib diisi.');ksbV10ValidateBankReference_(ref);
  ksbRequire_(!ksbFilter_('SETTLEMENTS',function(s){return s.bank_reference===ref;}).length,'Referensi bank sudah dipakai.');var mutation=ksbBankAssertUnmatched_(ref,'DEBIT',Number(claim.total));
  var amount=ksbAmount_(claim.total,'Nominal'),account=claim.party_type==='SELLER'?'PAYABLE_SELLER':'PAYABLE_COURIER';
  ksbRequire_(ksbAccountBalance_(account,claim.party_id)>=amount&&ksbCashBalance_()>=amount,'Saldo hak mitra atau kas tidak cukup.');
  ksbJournal_('SETTLEMENT',claim.id,'','Pencairan manual berdasarkan order',[
    {account:account,party_id:claim.party_id,debit:amount},{account:'CASH_PLATFORM',credit:amount}
  ]);
  ksbAppend_('SETTLEMENTS',{id:claim.id,party_id:claim.party_id,party_type:claim.party_type,amount:amount,bank_reference:ref,status:'PAID',created_by:actor.id,created_at:ksbNow_()});
  ksbFilter_('MANUAL_CLAIM_ITEMS_V7',function(i){return i.claim_id===claim.id;}).forEach(function(i){ksbAppend_('SETTLEMENT_ITEMS',{id:ksbId_('STI'),settlement_id:claim.id,order_id:i.order_id,amount:i.amount,created_at:ksbNow_()});});
  ksbPatch_('MANUAL_CLAIMS_V7',claim.id,{status:'PAID',bank_reference:ref,admin_id:actor.id,paid_at:ksbNow_()});ksbPatch_('BANK_MUTATIONS_V11',mutation.id,{status:'MATCHED',matched_entity_type:'PARTNER_CLAIM',matched_entity_id:claim.id,matched_at:ksbNow_()});
  ksbAudit_(actor.id,'CLAIM_PAID_V7','MANUAL_CLAIM',claim.id,{bankReference:ref,amount:amount});return {id:claim.id,status:'PAID',amount:amount};
 });}
/** Printable statement, not payment proof. Available only to owner/admin. */
function ksbClaimPdfV7_(actor,args){
 var claim=ksbRow_('MANUAL_CLAIMS_V7',args.id);
 ksbRequire_(claim&&(claim.party_id===actor.id||actor.roles.indexOf('ADMIN')>=0),'Tagihan tidak boleh diakses.');
 var items=ksbFilter_('MANUAL_CLAIM_ITEMS_V7',function(i){return i.claim_id===claim.id;});
 var doc=DocumentApp.create('KSB GO - Tagihan Mitra '+claim.id),body=doc.getBody();
 body.appendParagraph('KSB GO — Rekap Penghasilan Mitra').setHeading(DocumentApp.ParagraphHeading.HEADING1);
 body.appendParagraph('Nomor Tagihan: '+claim.id);
 body.appendParagraph('Mitra: '+claim.party_type+' / '+claim.party_id);
 body.appendParagraph('Tanggal Pengajuan: '+claim.created_at);
 body.appendParagraph('Rekening Penerima: '+claim.bank_name+' '+claim.bank_number_masked+' a.n. '+claim.bank_holder);
 var data=[['Nomor Order','Sumber','Hak Bersih (Rp)']];items.forEach(function(i){data.push([i.order_id,i.source_id,Number(i.amount).toLocaleString('id-ID')]);});
 body.appendTable(data);
 body.appendParagraph('TOTAL TAGIHAN: Rp '+Number(claim.total).toLocaleString('id-ID'));
 body.appendParagraph('STATUS: '+claim.status);
 if(claim.status==='PAID')body.appendParagraph('Referensi bank: '+claim.bank_reference);
 body.appendParagraph('Dokumen ini adalah rekap internal, BUKAN bukti dana telah masuk ke rekening mitra.');
 doc.saveAndClose();var file=DriveApp.getFileById(doc.getId()),pdf=file.getAs(MimeType.PDF);file.setTrashed(true);
 return {name:'KSB-Go-Tagihan-'+claim.id+'.pdf',mime:'application/pdf',base64:Utilities.base64Encode(pdf.getBytes())};
}
